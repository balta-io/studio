const themeStorageKey = 'studio-theme';
const themesDirectoryName = 'themes';
const lastSelectedThemeStorageKey = 'studio-themes-last-theme';
const newThemeButton = document.querySelector('#new-theme-button');
const themeList = document.querySelector('.sidebar-list');
const themeSidebarStatus = document.querySelector('#theme-sidebar-status');
const frontmatterPanel = document.querySelector('[data-theme-frontmatter]');
const saveThemeButton = document.querySelector('[data-save-theme]');
const deleteThemeButton = document.querySelector('[data-delete-theme]');
const tokenRows = [...document.querySelectorAll('.theme-token-row')];
const defaultTokenValues = new Map(tokenRows.map(row => [
    row.querySelector('.theme-token-label').textContent.trim(),
    row.querySelector('.theme-token-input').value
]));
let currentThemes = [];
let selectedTheme = null;

// Applied before body renders to avoid a flash of the wrong theme.
if (localStorage.getItem(themeStorageKey) === 'dark') {
    document.documentElement.classList.add('dark');
}

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.querySelector('#theme-toggle');
    if (!themeToggle) {
        return;
    }

    const updateThemeButton = () => {
        const isDark = document.documentElement.classList.contains('dark');
        const label = isDark ? 'Ativar tema claro' : 'Ativar tema escuro';
        themeToggle.setAttribute('aria-label', label);
        themeToggle.setAttribute('title', label);
        themeToggle.setAttribute('aria-pressed', String(isDark));
        themeToggle.querySelector('.header-button-icon').className = isDark
            ? 'ri-sun-line header-button-icon'
            : 'ri-moon-line header-button-icon';
    };

    themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem(themeStorageKey, document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        updateThemeButton();
    });

    updateThemeButton();
});

function setThemeSidebarStatus(message, type = '') {
    clearTimeout(setThemeSidebarStatus.hideTimer);
    themeSidebarStatus.querySelector('.folder-status-message').textContent = message;
    themeSidebarStatus.dataset.type = type;
    themeSidebarStatus.dataset.visible = String(Boolean(message));
    themeSidebarStatus.setAttribute('aria-hidden', String(!message));
    themeSidebarStatus.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';

    if (message) {
        setThemeSidebarStatus.hideTimer = setTimeout(() => setThemeSidebarStatus(''), 4000);
    }
}

function parseThemeMarkdown(markdown) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        return { entries: [], body: markdown };
    }

    const entries = frontmatterMatch[1]
        .split(/\r?\n/)
        .map(line => {
            const separatorIndex = line.indexOf(':');
            return separatorIndex === -1
                ? null
                : { key: line.slice(0, separatorIndex).trim(), value: line.slice(separatorIndex + 1).trim() };
        })
        .filter(Boolean);
    return { entries, body: markdown.slice(frontmatterMatch[0].length) };
}

function getThemeTokenValues(markdown) {
    const tokens = new Map();
    for (const line of markdown.split(/\r?\n/)) {
        const match = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.*?)\s*;\s*$/i);
        if (match) {
            tokens.set(match[1], match[2]);
        }
    }
    return tokens;
}

function syncColorPicker(input, picker) {
    if (/^#[0-9a-f]{6}$/i.test(input.value.trim())) {
        picker.value = input.value.trim();
    }
}

function loadThemeTokens(body = '') {
    const values = getThemeTokenValues(body);
    for (const row of tokenRows) {
        const name = row.querySelector('.theme-token-label').textContent.trim();
        const input = row.querySelector('.theme-token-input');
        const picker = row.querySelector('.theme-token-picker');
        input.value = values.get(name) ?? defaultTokenValues.get(name);
        syncColorPicker(input, picker);
    }
}

function renderFrontmatterEditor(frontmatter) {
    frontmatterPanel.replaceChildren();
    if (!frontmatter.entries.length) {
        frontmatterPanel.innerHTML = '<div class="empty-editor-state">Este tema não possui frontmatter.</div>';
        return;
    }

    const form = document.createElement('form');
    form.className = 'frontmatter-form';
    form.addEventListener('submit', event => event.preventDefault());
    for (const entry of frontmatter.entries) {
        const label = document.createElement('label');
        label.className = 'frontmatter-field';
        const name = document.createElement('span');
        name.textContent = entry.key;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = entry.value;
        input.dataset.frontmatterKey = entry.key;
        label.append(name, input);
        form.append(label);
    }
    frontmatterPanel.append(form);
}

function renderThemeList(themes, selectedFolderName = null) {
    themeList.replaceChildren();
    for (const theme of themes) {
        const item = document.createElement('button');
        item.className = 'sidebar-article sidebar-theme';
        item.classList.toggle('is-selected', theme.folderName === selectedFolderName);
        item.type = 'button';
        item.title = theme.folderName;
        item.addEventListener('click', () => selectTheme(theme.folderName));

        const icon = document.createElement('i');
        icon.className = 'ri-palette-line sidebar-article-icon';
        icon.setAttribute('aria-hidden', 'true');
        const content = document.createElement('span');
        content.className = 'sidebar-theme-content';
        const title = document.createElement('span');
        title.className = 'sidebar-theme-title';
        title.textContent = theme.title || theme.folderName;
        const slug = document.createElement('span');
        slug.className = 'sidebar-theme-slug';
        slug.textContent = theme.slug || theme.folderName;
        content.append(title, slug);
        item.append(icon, content);
        themeList.append(item);
    }
}

function resetThemeEditor() {
    selectedTheme = null;
    frontmatterPanel.innerHTML = '<div class="empty-editor-state">Selecione um tema para editar o frontmatter.</div>';
    loadThemeTokens();
    saveThemeButton.disabled = true;
    deleteThemeButton.disabled = true;
}

async function loadThemes(selectedFolderName = null) {
    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        resetThemeEditor();
        setThemeSidebarStatus('Abra uma pasta no Studio para ver os temas.', 'error');
        return;
    }

    const permission = await rootHandle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
        resetThemeEditor();
        setThemeSidebarStatus('Abra novamente a pasta no Studio para conceder acesso.', 'error');
        return;
    }

    let themesHandle;
    try {
        themesHandle = await rootHandle.getDirectoryHandle(themesDirectoryName);
    } catch (error) {
        if (error.name === 'NotFoundError') {
            currentThemes = [];
            renderThemeList([]);
            resetThemeEditor();
            setThemeSidebarStatus('Nenhum tema encontrado.', 'success');
            return;
        }
        throw error;
    }

    const themes = [];
    for await (const [folderName, handle] of themesHandle.entries()) {
        if (handle.kind !== 'directory') {
            continue;
        }
        let metadata = {};
        try {
            const indexFileHandle = await handle.getFileHandle('index.md');
            const parsed = parseThemeMarkdown(await (await indexFileHandle.getFile()).text());
            metadata = Object.fromEntries(parsed.entries.map(entry => [entry.key, entry.value]));
        } catch (error) {
            if (error.name !== 'NotFoundError') {
                throw error;
            }
        }
        themes.push({ folderName, ...metadata });
    }

    currentThemes = themes.sort((first, second) => first.folderName.localeCompare(second.folderName));
    renderThemeList(currentThemes, selectedFolderName);
    if (selectedFolderName) {
        await selectTheme(selectedFolderName);
    }
    setThemeSidebarStatus(selectedFolderName
        ? `Tema "${selectedFolderName}" carregado.`
        : `${currentThemes.length} tema(s) encontrado(s).`, 'success');
}

async function selectTheme(folderName) {
    try {
        const rootHandle = await getSavedFolderHandle();
        const themesHandle = await rootHandle.getDirectoryHandle(themesDirectoryName);
        const themeHandle = await themesHandle.getDirectoryHandle(folderName);
        const indexFileHandle = await themeHandle.getFileHandle('index.md');
        const markdown = await (await indexFileHandle.getFile()).text();
        const frontmatter = parseThemeMarkdown(markdown);
        selectedTheme = { folderName, themesHandle, themeHandle, frontmatter };
        renderFrontmatterEditor(frontmatter);
        loadThemeTokens(frontmatter.body);
        saveThemeButton.disabled = false;
        deleteThemeButton.disabled = false;
        renderThemeList(currentThemes, folderName);
        localStorage.setItem(lastSelectedThemeStorageKey, folderName);
    } catch (error) {
        localStorage.removeItem(lastSelectedThemeStorageKey);
        resetThemeEditor();
        setThemeSidebarStatus(error.message || 'Não foi possível abrir o tema.', 'error');
    }
}

function createThemeTitle(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `Theme ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function createThemeFrontmatter(organizationId, title, slug) {
    return `---
organization_id: ${organizationId}
title: ${title}
slug: ${slug}
---
`;
}

async function createTheme() {
    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setThemeSidebarStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }
    const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        setThemeSidebarStatus('Conceda acesso de escrita à pasta para criar um novo tema.', 'error');
        return;
    }
    const organizationId = localStorage.getItem('organization_id');
    if (!organizationId) {
        setThemeSidebarStatus('O organization_id da pasta aberta não foi encontrado.', 'error');
        return;
    }

    newThemeButton.disabled = true;
    try {
        const slug = `theme_${crypto.randomUUID()}`;
        const title = createThemeTitle();
        const themesHandle = await rootHandle.getDirectoryHandle(themesDirectoryName, { create: true });
        const themeHandle = await themesHandle.getDirectoryHandle(slug, { create: true });
        const indexFileHandle = await themeHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(createThemeFrontmatter(organizationId, title, slug));
        await writable.close();
        await loadThemes(slug);
    } catch (error) {
        setThemeSidebarStatus(error.message || 'Não foi possível criar o novo tema.', 'error');
    } finally {
        newThemeButton.disabled = false;
    }
}

async function copyThemeDirectoryContents(sourceHandle, targetHandle) {
    for await (const [name, handle] of sourceHandle.entries()) {
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            const targetFileHandle = await targetHandle.getFileHandle(name, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
        } else {
            const targetDirectoryHandle = await targetHandle.getDirectoryHandle(name, { create: true });
            await copyThemeDirectoryContents(handle, targetDirectoryHandle);
        }
    }
}

async function renameThemeFolder(themesHandle, oldFolderName, newFolderName) {
    try {
        await themesHandle.getDirectoryHandle(newFolderName);
        throw new Error(`Já existe um tema na pasta "${newFolderName}".`);
    } catch (error) {
        if (error.name !== 'NotFoundError') {
            throw error;
        }
    }

    const oldThemeHandle = await themesHandle.getDirectoryHandle(oldFolderName);
    const newThemeHandle = await themesHandle.getDirectoryHandle(newFolderName, { create: true });
    await copyThemeDirectoryContents(oldThemeHandle, newThemeHandle);
    await themesHandle.removeEntry(oldFolderName, { recursive: true });
    return newThemeHandle;
}

async function saveTheme() {
    if (!selectedTheme) {
        return;
    }
    saveThemeButton.disabled = true;
    deleteThemeButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar o tema.');
        }
        const fields = frontmatterPanel.querySelectorAll('[data-frontmatter-key]');
        const values = new Map([...fields].map(field => [field.dataset.frontmatterKey, field.value.trim()]));
        const newFolderName = values.get('slug');
        if (!newFolderName) {
            throw new Error('Preencha o slug para salvar o tema.');
        }
        values.set('slug', newFolderName);
        const frontmatterText = selectedTheme.frontmatter.entries
            .map(entry => `${entry.key}: ${values.get(entry.key) ?? entry.value}`)
            .join('\n');
        const tokenText = tokenRows
            .map(row => `${row.querySelector('.theme-token-label').textContent.trim()}: ${row.querySelector('.theme-token-input').value.trim()};`)
            .join('\n');
        const markdown = `---\n${frontmatterText}\n---\n${tokenText}\n`;
        const previousFolderName = selectedTheme.folderName;
        const themeHandle = newFolderName === previousFolderName
            ? selectedTheme.themeHandle
            : await renameThemeFolder(selectedTheme.themesHandle, previousFolderName, newFolderName);
        const indexFileHandle = await themeHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();
        selectedTheme.folderName = newFolderName;
        selectedTheme.themeHandle = themeHandle;
        selectedTheme.frontmatter = parseThemeMarkdown(markdown);
        await loadThemes(newFolderName);
        localStorage.setItem(lastSelectedThemeStorageKey, newFolderName);
        setThemeSidebarStatus('Informações do tema salvas.', 'success');
    } catch (error) {
        setThemeSidebarStatus(error.message || 'Não foi possível salvar o tema.', 'error');
    } finally {
        saveThemeButton.disabled = false;
        deleteThemeButton.disabled = false;
    }
}

async function deleteTheme() {
    if (!selectedTheme || !window.confirm(`Excluir o tema "${selectedTheme.folderName}" e todo o seu conteúdo?`)) {
        return;
    }
    saveThemeButton.disabled = true;
    deleteThemeButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir o tema.');
        }
        const deletedFolderName = selectedTheme.folderName;
        await selectedTheme.themesHandle.removeEntry(deletedFolderName, { recursive: true });
        localStorage.removeItem(lastSelectedThemeStorageKey);
        await loadThemes();
        setThemeSidebarStatus(`Tema "${deletedFolderName}" excluído.`, 'success');
    } catch (error) {
        setThemeSidebarStatus(error.message || 'Não foi possível excluir o tema.', 'error');
    } finally {
        saveThemeButton.disabled = false;
        deleteThemeButton.disabled = false;
    }
}

for (const row of tokenRows) {
    const textInput = row.querySelector('.theme-token-input');
    const colorPicker = row.querySelector('.theme-token-picker');
    textInput.addEventListener('input', () => syncColorPicker(textInput, colorPicker));
    colorPicker.addEventListener('input', () => {
        textInput.value = colorPicker.value.toUpperCase();
    });
}

newThemeButton.addEventListener('click', createTheme);
saveThemeButton.addEventListener('click', saveTheme);
deleteThemeButton.addEventListener('click', deleteTheme);
loadThemes(localStorage.getItem(lastSelectedThemeStorageKey)).catch(error => {
    resetThemeEditor();
    setThemeSidebarStatus(error.message || 'Não foi possível carregar os temas.', 'error');
});

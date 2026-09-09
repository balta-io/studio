const designSystemCollectionFolderName = 'design-system';
const designSystemThemesDirectoryName = 'themes';
const designSystemThemeStorageKey = 'studio-design-system-last-theme';
const designSystemComponentStorageKey = 'studio-design-system-last-component';
const designSystemListElement = document.querySelector('[data-design-system-list]');
const designSystemStatusElement = document.querySelector('[data-design-system-status]');
const designSystemEmptyElement = document.querySelector('[data-design-system-empty]');
const designSystemPreviewFrame = document.querySelector('[data-design-system-preview]');
const designSystemThemeSelect = document.querySelector('[data-design-system-theme-select]');
let designSystemCollectionHandle = null;
let designSystemThemeTokensCss = '';
let designSystemCurrentComponent = null;

function setDesignSystemStatus(message, type = '') {
    clearTimeout(setDesignSystemStatus.hideTimer);

    designSystemStatusElement.querySelector('.folder-status-message').textContent = message;
    designSystemStatusElement.dataset.type = type;
    designSystemStatusElement.dataset.visible = String(Boolean(message));
    designSystemStatusElement.setAttribute('aria-hidden', String(!message));
    designSystemStatusElement.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';

    if (message) {
        setDesignSystemStatus.hideTimer = setTimeout(() => setDesignSystemStatus(''), 3000);
    }
}

function getDesignSystemThemeTokenValues(markdown) {
    const tokens = new Map();
    for (const line of markdown.split(/\r?\n/)) {
        const match = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.*?)\s*;\s*$/i);
        if (match) {
            tokens.set(match[1], match[2]);
        }
    }
    return tokens;
}

function applyDesignSystemThemeVars(tokens) {
    let styleElement = document.getElementById('design-system-theme-vars');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'design-system-theme-vars';
        document.head.append(styleElement);
    }

    if (!tokens.size) {
        designSystemThemeTokensCss = '';
        styleElement.textContent = '';
        return;
    }

    const rules = [...tokens.entries()].map(([name, value]) => `    ${name}: ${value};`).join('\n');
    designSystemThemeTokensCss = `:root {\n${rules}\n}`;
    styleElement.textContent = designSystemThemeTokensCss;
}

async function selectDesignSystemTheme(folderName) {
    localStorage.setItem(designSystemThemeStorageKey, folderName || '');

    if (!folderName) {
        applyDesignSystemThemeVars(new Map());
        renderComponentPreview();
        return;
    }

    try {
        const rootHandle = await getSavedFolderHandle();
        const themesHandle = await rootHandle.getDirectoryHandle(designSystemThemesDirectoryName);
        const themeHandle = await themesHandle.getDirectoryHandle(folderName);
        const indexFileHandle = await themeHandle.getFileHandle('index.md');
        const markdown = await (await indexFileHandle.getFile()).text();
        const bodyMatch = markdown.match(/^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/);
        const tokens = getDesignSystemThemeTokenValues(bodyMatch ? bodyMatch[1] : markdown);
        applyDesignSystemThemeVars(tokens);
        renderComponentPreview();
    } catch (error) {
        setDesignSystemStatus(error.message || `Não foi possível carregar o tema "${folderName}".`, 'error');
    }
}

async function loadDesignSystemThemeOptions() {
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            return;
        }

        const themesHandle = await rootHandle.getDirectoryHandle(designSystemThemesDirectoryName);
        const themes = [];
        for await (const [folderName, handle] of themesHandle.entries()) {
            if (handle.kind !== 'directory') {
                continue;
            }
            try {
                const indexFileHandle = await handle.getFileHandle('index.md');
                const frontmatter = parseDesignSystemFrontmatter(await (await indexFileHandle.getFile()).text());
                themes.push({ folderName, title: frontmatter.title || folderName });
            } catch (error) {
                // Subpastas sem index.md não representam temas.
            }
        }

        themes.sort((first, second) => first.title.localeCompare(second.title));
        for (const theme of themes) {
            const option = document.createElement('option');
            option.value = theme.folderName;
            option.textContent = theme.title;
            designSystemThemeSelect.append(option);
        }

        const lastThemeFolderName = localStorage.getItem(designSystemThemeStorageKey);
        if (lastThemeFolderName && themes.some(theme => theme.folderName === lastThemeFolderName)) {
            designSystemThemeSelect.value = lastThemeFolderName;
            await selectDesignSystemTheme(lastThemeFolderName);
        }
    } catch (error) {
        // Pasta de temas não encontrada; mantém apenas o tema padrão.
    }
}

function parseDesignSystemFrontmatter(markdown) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        return {};
    }

    return Object.fromEntries(frontmatterMatch[1].split(/\r?\n/).filter(line => line.trim()).map(line => {
        const separatorIndex = line.indexOf(':');
        return separatorIndex === -1
            ? [line.trim(), '']
            : [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
    }));
}

function renderDesignSystemList(components, selectedFolderName = null) {
    designSystemListElement.replaceChildren();
    for (const component of components) {
        const item = document.createElement('button');
        item.className = 'sidebar-article sidebar-theme';
        item.classList.toggle('is-selected', component.folderName === selectedFolderName);
        item.type = 'button';
        item.title = component.folderName;
        item.addEventListener('click', () => selectDesignSystemComponent(component.folderName, item));

        const icon = document.createElement('i');
        icon.className = 'ri-stack-line sidebar-article-icon';
        icon.setAttribute('aria-hidden', 'true');

        const content = document.createElement('span');
        content.className = 'sidebar-theme-content';
        const title = document.createElement('span');
        title.className = 'sidebar-theme-title';
        title.textContent = component.title || component.folderName;
        const slug = document.createElement('span');
        slug.className = 'sidebar-theme-slug';
        slug.textContent = component.slug || component.folderName;
        content.append(title, slug);

        item.append(icon, content);
        designSystemListElement.append(item);
    }
}

async function selectDesignSystemComponent(folderName, item) {
    for (const sibling of designSystemListElement.children) {
        sibling.classList.toggle('is-selected', sibling === item);
    }
    localStorage.setItem(designSystemComponentStorageKey, folderName);

    setDesignSystemStatus(`Carregando "${folderName}"...`);
    try {
        const componentHandle = await designSystemCollectionHandle.getDirectoryHandle(folderName);
        const html = await readComponentFile(componentHandle, 'index.html');
        const css = await readComponentFile(componentHandle, 'style.css');
        const js = await readComponentFile(componentHandle, 'script.js');

        designSystemCurrentComponent = { folderName, html, css, js };
        renderComponentPreview();
        setDesignSystemStatus(`Componente "${folderName}" carregado.`, 'success');
    } catch (error) {
        setDesignSystemStatus(error.message || `Não foi possível carregar "${folderName}".`, 'error');
    }
}

function renderComponentPreview() {
    if (!designSystemCurrentComponent) {
        return;
    }

    const { html, css, js } = designSystemCurrentComponent;
    designSystemPreviewFrame.srcdoc = `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="css/styles.css">
<style>${designSystemThemeTokensCss}</style>
<style>${css || ''}</style>
</head>
<body>
${html || ''}
<script>${js || ''}</script>
</body>
</html>`;
    designSystemEmptyElement.hidden = true;
    designSystemPreviewFrame.hidden = false;
}

async function readComponentFile(componentHandle, fileName) {
    try {
        const fileHandle = await componentHandle.getFileHandle(fileName);
        return await (await fileHandle.getFile()).text();
    } catch (error) {
        return '';
    }
}

async function loadDesignSystemComponents() {
    setDesignSystemStatus('Carregando componentes...');

    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setDesignSystemStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    const permission = await rootHandle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
        setDesignSystemStatus('Conceda acesso à pasta para carregar os componentes.', 'error');
        return;
    }

    let collectionHandle;
    try {
        collectionHandle = await rootHandle.getDirectoryHandle(designSystemCollectionFolderName);
    } catch (error) {
        setDesignSystemStatus(`A pasta "${designSystemCollectionFolderName}" não foi encontrada.`, 'error');
        return;
    }

    designSystemCollectionHandle = collectionHandle;
    const components = [];
    for await (const [folderName, handle] of collectionHandle.entries()) {
        if (handle.kind !== 'directory') {
            continue;
        }

        try {
            const indexFileHandle = await handle.getFileHandle('index.md');
            const frontmatter = parseDesignSystemFrontmatter(await (await indexFileHandle.getFile()).text());
            components.push({ folderName, title: frontmatter.title, slug: frontmatter.slug });
        } catch (error) {
            // Subpastas sem index.md não representam componentes.
        }
    }

    components.sort((first, second) => (first.title || first.folderName).localeCompare(second.title || second.folderName));
    const lastComponentFolderName = localStorage.getItem(designSystemComponentStorageKey);
    renderDesignSystemList(components, lastComponentFolderName);
    setDesignSystemStatus(`${components.length} componente(s) encontrado(s).`, 'success');

    if (lastComponentFolderName && components.some(component => component.folderName === lastComponentFolderName)) {
        const selectedItem = [...designSystemListElement.children]
            .find(item => item.title === lastComponentFolderName);
        await selectDesignSystemComponent(lastComponentFolderName, selectedItem);
    }
}

loadDesignSystemComponents().catch(error => {
    setDesignSystemStatus(error.message || 'Não foi possível carregar os componentes.', 'error');
});

loadDesignSystemThemeOptions().catch(error => {
    setDesignSystemStatus(error.message || 'Não foi possível carregar os temas.', 'error');
});

designSystemThemeSelect.addEventListener('change', () => {
    selectDesignSystemTheme(designSystemThemeSelect.value).catch(error => {
        setDesignSystemStatus(error.message || 'Não foi possível aplicar o tema.', 'error');
    });
});

const snippetsListElement = document.querySelector('[data-snippets-list]');
const snippetsStatusElement = document.querySelector('[data-snippets-status]');
const newSnippetButton = document.querySelector('#new-snippet-button');
const frontmatterPanel = document.querySelector('[data-frontmatter-panel]');
const markdownEditor = document.querySelector('[data-markdown-editor]');
const saveSnippetButton = document.querySelector('[data-save-snippet]');
const snippetCanvas = document.querySelector('[data-snippet-canvas]');
const snippetCanvasEmpty = document.querySelector('[data-snippet-canvas-empty]');
const snippetStatuses = ['backlog', 'todo', 'draft', 'ready', 'scheduled', 'published'];
const lastSelectedSnippetStorageKey = 'studio-snippets-last-snippet';
let selectedSnippet = null;
let markdownEditorDirty = false;

function setSnippetsStatus(message, type = '') {
    clearTimeout(setSnippetsStatus.hideTimer);

    snippetsStatusElement.querySelector('.folder-status-message').textContent = message;
    snippetsStatusElement.dataset.type = type;
    snippetsStatusElement.dataset.visible = String(Boolean(message));
    snippetsStatusElement.setAttribute('aria-hidden', String(!message));
    snippetsStatusElement.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';

    if (message) {
        setSnippetsStatus.hideTimer = setTimeout(() => setSnippetsStatus(''), 3000);
    }
}

async function loadSnippetTemplateImage() {
    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        snippetCanvasEmpty.textContent = 'Nenhuma pasta aberta.';
        return;
    }

    const assetsHandle = await rootHandle.getDirectoryHandle('_assets');
    const templatesHandle = await assetsHandle.getDirectoryHandle('templates');
    const imageHandle = await templatesHandle.getFileHandle('snippet.png');
    const imageFile = await imageHandle.getFile();
    const imageUrl = URL.createObjectURL(imageFile);
    const image = new Image();

    image.addEventListener('load', () => {
        snippetCanvas.width = image.naturalWidth;
        snippetCanvas.height = image.naturalHeight;
        snippetCanvas.getContext('2d').drawImage(image, 0, 0);
        snippetCanvas.hidden = false;
        snippetCanvasEmpty.hidden = true;
        URL.revokeObjectURL(imageUrl);
    }, { once: true });
    image.src = imageUrl;
}

function renderSnippetList(snippets, selectedSnippetName = null) {
    snippetsListElement.replaceChildren();

    if (!snippets.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'sidebar-empty-message';
        emptyMessage.textContent = 'Nenhum snippet encontrado.';
        snippetsListElement.append(emptyMessage);
        return;
    }

    for (const snippet of snippets) {
        const item = document.createElement('div');
        item.className = 'sidebar-article';
        item.dataset.snippetName = snippet.folderName;
        if (snippet.folderName === selectedSnippetName) {
            item.classList.add('is-selected');
            item.setAttribute('aria-current', 'true');
        }
        item.setAttribute('role', 'listitem');

        const icon = document.createElement('i');
        icon.className = 'ri-code-s-slash-line sidebar-article-icon';
        icon.setAttribute('aria-hidden', 'true');

        const details = document.createElement('span');
        details.className = 'sidebar-article-details';

        const title = document.createElement('span');
        title.className = 'sidebar-article-title';
        title.textContent = snippet.title;

        const fileName = document.createElement('span');
        fileName.className = 'sidebar-article-folder';
        fileName.textContent = 'index.md';

        details.append(title, fileName);
        item.append(icon, details);
        snippetsListElement.append(item);
    }
}

async function loadSnippets(selectedSnippetName = null) {
    snippetsListElement.replaceChildren();
    setSnippetsStatus('Carregando snippets...');

    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setSnippetsStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    const permission = await rootHandle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
        setSnippetsStatus('Conceda acesso à pasta para carregar os snippets.', 'error');
        return;
    }

    let snippetsHandle;
    try {
        snippetsHandle = await rootHandle.getDirectoryHandle('snippets');
    } catch (error) {
        setSnippetsStatus('A pasta "snippets" não foi encontrada.', 'error');
        return;
    }

    const snippets = [];
    for await (const [name, handle] of snippetsHandle.entries()) {
        if (handle.kind !== 'directory') {
            continue;
        }

        try {
            await handle.getFileHandle('index.md');
            const indexFile = await (await handle.getFileHandle('index.md')).getFile();
            const frontmatter = parseSnippetFrontmatter(await indexFile.text());
            const titleEntry = frontmatter.entries.find(entry => entry.key === 'title');
            snippets.push({
                folderName: name,
                title: titleEntry?.value || name
            });
        } catch (error) {
            // Subpastas sem index.md não fazem parte da lista de snippets.
        }
    }

    snippets.sort((first, second) => first.title.localeCompare(second.title));
    renderSnippetList(snippets, selectedSnippetName);
    if (selectedSnippetName && snippets.some(snippet => snippet.folderName === selectedSnippetName)) {
        await selectSnippet(selectedSnippetName);
    }
    setSnippetsStatus(`${snippets.length} snippet(s) encontrado(s).`, 'success');
}

function parseSnippetFrontmatter(markdown) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        return { entries: [], body: markdown };
    }

    const entries = frontmatterMatch[1].split(/\r?\n/).filter(line => line.trim()).map(line => {
        const separatorIndex = line.indexOf(':');
        return separatorIndex === -1
            ? { key: line.trim(), value: '' }
            : {
                key: line.slice(0, separatorIndex).trim(),
                value: line.slice(separatorIndex + 1).trim()
            };
    });

    return { entries, body: markdown.slice(frontmatterMatch[0].length) };
}

function toDatetimeLocalValue(value) {
    const match = (value || '').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    return match ? match[1] : '';
}

function fromDatetimeLocalValue(value) {
    return value ? `${value}:00Z` : '';
}

function renderFrontmatterEditor(frontmatter) {
    frontmatterPanel.replaceChildren();

    if (!frontmatter.entries.length) {
        const message = document.createElement('div');
        message.className = 'empty-editor-state';
        message.textContent = 'Este snippet não possui um frontmatter editável.';
        frontmatterPanel.append(message);
        saveSnippetButton.disabled = true;
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

        const input = entry.key === 'summary'
            ? document.createElement('textarea')
            : entry.key === 'status'
                ? document.createElement('select')
                : document.createElement('input');
        input.name = entry.key;
        input.dataset.frontmatterKey = entry.key;
        input.disabled = entry.key === 'organization_id';
        if (entry.key === 'summary') {
            input.rows = 5;
        }

        if (entry.key === 'status') {
            for (const status of snippetStatuses) {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                input.append(option);
            }
        }

        if (entry.key === 'published_at_utc') {
            input.type = 'datetime-local';
        }

        input.value = entry.key === 'published_at_utc' ? toDatetimeLocalValue(entry.value) : entry.value;
        label.append(name, input);

        if (entry.key === 'title' || entry.key === 'slug' || entry.key === 'summary') {
            const counter = document.createElement('span');
            counter.className = 'frontmatter-counter';
            const maxLength = entry.key === 'title' ? 80 : entry.key === 'slug' ? 120 : 160;
            input.maxLength = maxLength;
            const updateCounter = () => {
                counter.textContent = `${input.value.length}/${maxLength}`;
            };
            input.addEventListener('input', () => {
                if (input.value.length > maxLength) {
                    input.value = input.value.slice(0, maxLength);
                }
                updateCounter();
            });
            updateCounter();
            label.append(counter);
        }

        form.append(label);
    }

    frontmatterPanel.append(form);
    saveSnippetButton.disabled = false;
}

function renderMarkdownEditor(markdown) {
    markdownEditor.value = markdown;
    markdownEditor.disabled = false;
    markdownEditorDirty = false;
}

function getEditedMarkdown() {
    const markdown = markdownEditor.value.trim();
    return markdown ? `${markdown}\n` : '';
}

async function selectSnippet(snippetName) {
    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setSnippetsStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    try {
        const snippetsHandle = await rootHandle.getDirectoryHandle('snippets');
        const snippetHandle = await snippetsHandle.getDirectoryHandle(snippetName);
        const indexFileHandle = await snippetHandle.getFileHandle('index.md');
        const markdown = await (await indexFileHandle.getFile()).text();
        const frontmatter = parseSnippetFrontmatter(markdown);

        selectedSnippet = { name: snippetName, handle: snippetHandle, frontmatter };
        localStorage.setItem(lastSelectedSnippetStorageKey, snippetName);
        renderFrontmatterEditor(frontmatter);
        renderMarkdownEditor(frontmatter.body);
        renderSnippetList([...snippetsListElement.querySelectorAll('[data-snippet-name]')]
            .map(item => ({ folderName: item.dataset.snippetName, title: item.querySelector('.sidebar-article-title').textContent })), snippetName);
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível abrir o snippet.', 'error');
    }
}

const snippetSlugMaxLength = 120;

function slugifySnippet(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, snippetSlugMaxLength);
}

async function copyDirectoryContents(sourceHandle, targetHandle) {
    for await (const [name, handle] of sourceHandle.entries()) {
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            const newFileHandle = await targetHandle.getFileHandle(name, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
        } else {
            const newDirectoryHandle = await targetHandle.getDirectoryHandle(name, { create: true });
            await copyDirectoryContents(handle, newDirectoryHandle);
        }
    }
}

async function renameSnippetFolder(snippetsHandle, oldFolderName, newFolderName) {
    const newHandle = await snippetsHandle.getDirectoryHandle(newFolderName, { create: true });
    const oldHandle = await snippetsHandle.getDirectoryHandle(oldFolderName);
    await copyDirectoryContents(oldHandle, newHandle);
    await snippetsHandle.removeEntry(oldFolderName, { recursive: true });
    return newHandle;
}

async function saveSnippet() {
    if (!selectedSnippet) {
        return;
    }

    saveSnippetButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar o snippet.');
        }

        const fields = frontmatterPanel.querySelectorAll('[data-frontmatter-key]');
        const values = new Map([...fields].map(field => [
            field.dataset.frontmatterKey,
            field.dataset.frontmatterKey === 'published_at_utc'
                ? fromDatetimeLocalValue(field.value)
                : field.value
        ]));
        const newFolderName = values.has('slug') && values.get('slug').trim()
            ? slugifySnippet(values.get('slug'))
            : selectedSnippet.name;
        if (values.has('slug')) {
            values.set('slug', newFolderName);
        }

        const frontmatterText = selectedSnippet.frontmatter.entries
            .map(entry => `${entry.key}: ${values.get(entry.key) ?? entry.value}`)
            .join('\n');
        const markdown = `---\n${frontmatterText}\n---\n${getEditedMarkdown()}`;

        let snippetHandle = selectedSnippet.handle;
        if (newFolderName !== selectedSnippet.name) {
            const snippetsHandle = await rootHandle.getDirectoryHandle('snippets');
            snippetHandle = await renameSnippetFolder(snippetsHandle, selectedSnippet.name, newFolderName);
        }

        const indexFileHandle = await snippetHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();
        selectedSnippet.name = newFolderName;
        selectedSnippet.handle = snippetHandle;
        selectedSnippet.frontmatter = parseSnippetFrontmatter(markdown);
        markdownEditorDirty = false;
        localStorage.setItem(lastSelectedSnippetStorageKey, newFolderName);
        await loadSnippets(newFolderName);
        setSnippetsStatus(`Snippet "${newFolderName}" salvo.`, 'success');
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível salvar o snippet.', 'error');
    } finally {
        saveSnippetButton.disabled = false;
    }
}

function createSnippetFrontmatter(organizationId, title, slug) {
    return `---
organization_id: ${organizationId}
title: ${title}
slug: ${slug}
summary: TBD
status: backlog
published_at_utc:
---
`;
}

function createSnippetTitleAndSlug(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const timePart = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    const title = `Snippet - ${datePart} ${timePart.replaceAll('-', ':')}`;
    const slug = `snippet_${datePart}_${timePart}`;

    return { title, slug };
}

async function createSnippet() {
    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setSnippetsStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        setSnippetsStatus('Conceda acesso de escrita à pasta para criar um snippet.', 'error');
        return;
    }

    const organizationId = localStorage.getItem('organization_id');
    if (!organizationId) {
        setSnippetsStatus('O organization_id da pasta aberta não foi encontrado.', 'error');
        return;
    }

    newSnippetButton.disabled = true;
    setSnippetsStatus('Criando novo snippet...');

    try {
        const { title, slug } = createSnippetTitleAndSlug();
        const snippetsHandle = await rootHandle.getDirectoryHandle('snippets', { create: true });
        const snippetHandle = await snippetsHandle.getDirectoryHandle(slug, { create: true });
        const indexFileHandle = await snippetHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(createSnippetFrontmatter(organizationId, title, slug));
        await writable.close();

        await loadSnippets(slug);
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível criar o novo snippet.', 'error');
    } finally {
        newSnippetButton.disabled = false;
    }
}

loadSnippets(localStorage.getItem(lastSelectedSnippetStorageKey)).catch(error => {
    setSnippetsStatus(error.message || 'Não foi possível carregar os snippets.', 'error');
});

loadSnippetTemplateImage().catch(error => {
    snippetCanvasEmpty.textContent = error.message || 'Não foi possível carregar o template.';
});

newSnippetButton?.addEventListener('click', createSnippet);
snippetsListElement.addEventListener('click', event => {
    const item = event.target.closest('[data-snippet-name]');
    if (item) {
        selectSnippet(item.dataset.snippetName);
    }
});
saveSnippetButton?.addEventListener('click', saveSnippet);
markdownEditor?.addEventListener('input', () => {
    markdownEditorDirty = true;
});

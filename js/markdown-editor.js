const markdownEditorInput = document.querySelector('[data-markdown-editor-input]');
const markdownEditorStatus = document.querySelector('[data-markdown-editor-status]');
const markdownEditorLocation = document.querySelector('[data-markdown-editor-location]');
const historyBackButton = document.querySelector('[data-history-back]');
const markdownEditorFields = [...document.querySelectorAll('[data-markdown-editor-field]')];
const markdownEditorSaveButton = document.querySelector('[data-markdown-editor-save]');
const markdownEditorPublishButton = document.querySelector('[data-markdown-editor-publish]');
const markdownEditorPreview = document.querySelector('[data-markdown-editor-preview]');
let currentContent = null;

historyBackButton.addEventListener('click', event => {
    if (window.history.length > 1) {
        event.preventDefault();
        window.history.back();
    }
});

function updateFrontmatterCounter(field) {
    const counter = document.querySelector(`[data-markdown-editor-counter="${field.dataset.markdownEditorField}"]`);
    counter.textContent = `${field.value.length}/${field.maxLength}`;
}

function setFrontmatterValues(frontmatter = {}) {
    for (const field of markdownEditorFields) {
        field.value = frontmatter[field.dataset.markdownEditorField] || '';
        updateFrontmatterCounter(field);
    }
}

function renderMarkdownPreview() {
    markdownEditorPreview.innerHTML = window.marked.parse(markdownEditorInput.value);
}

function parseMarkdown(markdown) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        return { frontmatter: {}, frontmatterText: '', body: markdown };
    }

    const lines = frontmatterMatch[1].split(/\r?\n/);
    const frontmatter = {};
    for (let index = 0; index < lines.length; index += 1) {
        const separatorIndex = lines[index].indexOf(':');
        if (separatorIndex === -1 || /^\s/.test(lines[index])) {
            continue;
        }

        const key = lines[index].slice(0, separatorIndex).trim();
        const value = lines[index].slice(separatorIndex + 1).trim();
        if (!/^[>|][+-]?$/.test(value)) {
            frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
            continue;
        }

        const multilineValue = [];
        while (/^\s/.test(lines[index + 1] || '')) {
            index += 1;
            multilineValue.push(lines[index].trim());
        }
        frontmatter[key] = multilineValue.join(value.startsWith('>') ? ' ' : '\n');
    }

    return { frontmatter, frontmatterText: frontmatterMatch[1], body: markdown.slice(frontmatterMatch[0].length) };
}

function getFrontmatterFieldValues() {
    return Object.fromEntries(markdownEditorFields.map(field => [field.dataset.markdownEditorField, field.value.trim()]));
}

function formatFrontmatterValue(value) {
    return JSON.stringify(value);
}

function buildMarkdown(frontmatterText, values, body) {
    const updatedKeys = new Set();
    const sourceLines = frontmatterText ? frontmatterText.split(/\r?\n/) : [];
    const lines = [];

    for (let index = 0; index < sourceLines.length; index += 1) {
        const line = sourceLines[index];
        const match = line.match(/^(\s*)(title|slug|summary)(\s*):\s*(.*)$/);
        if (!match) {
            lines.push(line);
            continue;
        }

        const key = match[2];
        updatedKeys.add(key);
        lines.push(`${match[1]}${key}${match[3]}: ${formatFrontmatterValue(values[key])}`);

        if (/^[>|][+-]?$/.test(match[4])) {
            while (/^\s/.test(sourceLines[index + 1] || '')) {
                index += 1;
            }
        }
    }

    for (const key of ['title', 'slug', 'summary']) {
        if (!updatedKeys.has(key)) {
            lines.push(`${key}: ${formatFrontmatterValue(values[key])}`);
        }
    }

    return `---\n${lines.join('\n')}\n---\n${body}`;
}

async function copyDirectoryContents(sourceHandle, targetHandle) {
    for await (const [name, handle] of sourceHandle.entries()) {
        if (handle.kind === 'file') {
            const sourceFile = await handle.getFile();
            const targetFileHandle = await targetHandle.getFileHandle(name, { create: true });
            const writable = await targetFileHandle.createWritable();
            await writable.write(await sourceFile.arrayBuffer());
            await writable.close();
        } else {
            const targetDirectoryHandle = await targetHandle.getDirectoryHandle(name, { create: true });
            await copyDirectoryContents(handle, targetDirectoryHandle);
        }
    }
}

async function renameContentFolder(collectionHandle, oldFolderName, newFolderName) {
    try {
        await collectionHandle.getDirectoryHandle(newFolderName);
        throw new Error(`Já existe um conteúdo com o slug "${newFolderName}".`);
    } catch (error) {
        if (error.name !== 'NotFoundError') {
            throw error;
        }
    }

    const oldHandle = await collectionHandle.getDirectoryHandle(oldFolderName);
    const newHandle = await collectionHandle.getDirectoryHandle(newFolderName, { create: true });
    await copyDirectoryContents(oldHandle, newHandle);
    await collectionHandle.removeEntry(oldFolderName, { recursive: true });
    return newHandle;
}

function updateContentLocation(type, content) {
    const parameters = new URLSearchParams(window.location.search);
    parameters.set('type', type);
    parameters.set('content', content);
    window.history.replaceState(null, '', `${window.location.pathname}?${parameters}`);
    markdownEditorLocation.textContent = `${type}/${content}/index.md`;
    document.title = `Studio | ${content}`;
}

function setMarkdownEditorStatus(message, type = '') {
    markdownEditorStatus.querySelector('.folder-status-message').textContent = message;
    markdownEditorStatus.dataset.type = type;
    markdownEditorStatus.dataset.visible = String(Boolean(message));
    markdownEditorStatus.setAttribute('aria-hidden', String(!message));
    markdownEditorStatus.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : 'ri-information-line folder-status-icon';
}

function getContentLocation() {
    const parameters = new URLSearchParams(window.location.search);
    const type = parameters.get('type')?.trim();
    const content = parameters.get('content')?.trim();

    if (!type || !content) {
        throw new Error('Informe os parâmetros type e content na URL.');
    }

    if (!/^[a-z0-9][a-z0-9-]*$/i.test(type) || !/^[a-z0-9][a-z0-9-]*$/i.test(content)) {
        throw new Error('Os parâmetros type e content devem conter apenas letras, números e hífens.');
    }

    return { type, content };
}

async function loadMarkdown() {
    try {
        const { type, content } = getContentLocation();
        const rootHandle = await getSavedFolderHandle();

        if (!rootHandle) {
            throw new Error('Abra uma pasta no Studio antes de editar conteúdo.');
        }

        const permission = await rootHandle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
            throw new Error('Abra novamente a pasta no Studio para conceder acesso.');
        }

        const collectionHandle = await rootHandle.getDirectoryHandle(type);
        const contentHandle = await collectionHandle.getDirectoryHandle(content);
        const indexFileHandle = await contentHandle.getFileHandle('index.md');
        const indexFile = await indexFileHandle.getFile();

        const { frontmatter, frontmatterText, body } = parseMarkdown(await indexFile.text());
        setFrontmatterValues(frontmatter);
        markdownEditorInput.value = body;
        renderMarkdownPreview();
        markdownEditorInput.placeholder = '';
        currentContent = { collectionHandle, contentHandle, content, frontmatterText, type };
        updateContentLocation(type, content);
    } catch (error) {
        currentContent = null;
        setFrontmatterValues();
        markdownEditorInput.value = '';
        markdownEditorPreview.replaceChildren();
        markdownEditorInput.placeholder = 'Não foi possível carregar o conteúdo.';
        const message = error.name === 'NotFoundError'
            ? 'O arquivo solicitado não foi encontrado.'
            : error.message || 'Não foi possível carregar o conteúdo.';
        setMarkdownEditorStatus(message, 'error');
    }
}

async function saveMarkdown() {
    if (!currentContent) {
        return;
    }

    markdownEditorSaveButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar o conteúdo.');
        }

        const values = getFrontmatterFieldValues();
        if (!values.slug || values.slug === '.' || values.slug === '..' || /[\\/\0]/.test(values.slug)) {
            throw new Error('Informe um slug válido para a pasta do conteúdo.');
        }

        const markdown = buildMarkdown(currentContent.frontmatterText, values, markdownEditorInput.value);
        let contentHandle = currentContent.contentHandle;
        if (values.slug !== currentContent.content) {
            contentHandle = await renameContentFolder(currentContent.collectionHandle, currentContent.content, values.slug);
        }

        const indexFileHandle = await contentHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();

        currentContent = {
            ...currentContent,
            content: values.slug,
            contentHandle,
            frontmatterText: parseMarkdown(markdown).frontmatterText
        };
        updateContentLocation(currentContent.type, currentContent.content);
        setMarkdownEditorStatus('Conteúdo salvo.', 'success');
    } catch (error) {
        setMarkdownEditorStatus(error.message || 'Não foi possível salvar o conteúdo.', 'error');
    } finally {
        markdownEditorSaveButton.disabled = false;
    }
}

function goToPublish() {
    if (!currentContent) {
        return;
    }

    const parameters = new URLSearchParams();
    parameters.set('type', currentContent.type);
    parameters.set('content', currentContent.content);
    window.location.href = `publish.html?${parameters}`;
}

markdownEditorFields.forEach(field => field.addEventListener('input', () => updateFrontmatterCounter(field)));
markdownEditorInput.addEventListener('input', renderMarkdownPreview);
markdownEditorSaveButton.addEventListener('click', saveMarkdown);
markdownEditorPublishButton.addEventListener('click', goToPublish);
loadMarkdown();
const sectionSlug = location.pathname.split('/').pop().replace('.html', '');
const articleListElement = document.querySelector('[data-article-list]');
const sidebarStatusElement = document.querySelector('[data-sidebar-status]');
const newArticleButton = document.querySelector('#new-article-button');
const articleTitleFilter = document.querySelector('[data-article-title-filter]');
const articleStatusFilter = document.querySelector('[data-article-filter]');
const frontmatterPanel = document.querySelector('[data-frontmatter-panel]');
const markdownEditor = document.querySelector('[data-markdown-editor]');
const markdownPreviewButton = document.querySelector('[data-markdown-preview]');
const markdownPreviewDialog = document.querySelector('[data-markdown-preview-dialog]');
const markdownPreviewContent = document.querySelector('[data-markdown-preview-content]');
const markdownPreviewShadowRoot = markdownPreviewContent?.attachShadow({ mode: 'open' });
const markdownPreviewCloseButton = document.querySelector('[data-markdown-preview-close]');
const assetsList = document.querySelector('[data-assets-list]');
const newAssetButton = document.querySelector('[data-new-asset]');
const imagesList = document.querySelector('[data-images-list]');
const generateImagesButton = document.querySelector('[data-generate-images]');
const imageFileExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'];
const imageDialog = document.querySelector('[data-image-dialog]');
const imageDialogTitle = document.querySelector('[data-image-dialog-title]');
const imageDialogPreview = document.querySelector('[data-image-dialog-preview]');
const imageDialogCloseButton = document.querySelector('[data-image-dialog-close]');
const imageDeleteButton = document.querySelector('[data-image-delete]');
const imageDownloadButton = document.querySelector('[data-image-download]');
const assetDialog = document.querySelector('[data-asset-dialog]');
const assetDialogForm = document.querySelector('[data-asset-form]');
const assetDialogTitle = document.querySelector('[data-asset-dialog-title]');
const assetEditor = document.querySelector('[data-asset-editor]');
const assetSaveButton = document.querySelector('[data-asset-save]');
const assetDeleteButton = document.querySelector('[data-asset-delete]');
const assetCancelButtons = document.querySelectorAll('[data-asset-cancel]');
const saveArticleButton = document.querySelector('[data-save-article]');
const deleteArticleButton = document.querySelector('[data-delete-article]');
const articleStatusFilterStorageKey = 'studio-article-status-filter';
const lastSelectedArticleStorageKey = `studio-${sectionSlug}-last-article`;
const articleStatuses = ['backlog', 'todo', 'draft', 'ready', 'scheduled', 'published'];
let currentArticles = [];
let selectedArticle = null;
let selectedArticleTitleFilter = '';
let markdownEditorDirty = false;
let selectedAsset = null;
let selectedImage = null;
let currentImageFiles = [];
let selectedArticleStatusFilter = articleStatuses.includes(localStorage.getItem(articleStatusFilterStorageKey))
    ? localStorage.getItem(articleStatusFilterStorageKey)
    : 'all';

function setSidebarStatus(message, type = '') {
    clearTimeout(setSidebarStatus.hideTimer);

    sidebarStatusElement.querySelector('.folder-status-message').textContent = message;
    sidebarStatusElement.dataset.type = type;
    sidebarStatusElement.dataset.visible = String(Boolean(message));
    sidebarStatusElement.setAttribute('aria-hidden', String(!message));
    sidebarStatusElement.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';

    if (message) {
        setSidebarStatus.hideTimer = setTimeout(() => setSidebarStatus(''), 3000);
    }
}

function parseArticleFrontmatter(markdown) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        return { entries: [], body: markdown };
    }

    const entries = frontmatterMatch[1].split(/\r?\n/).reduce((metadata, line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) {
            return metadata;
        }

        const key = line.slice(0, separatorIndex).trim();
        metadata.push({ key, value: line.slice(separatorIndex + 1).trim() });

        return metadata;
    }, []);

    return {
        entries,
        body: markdown.slice(frontmatterMatch[0].length)
    };
}

function extractArticleMetadata(markdown) {
    return Object.fromEntries(parseArticleFrontmatter(markdown).entries.map(entry => [entry.key, entry.value]));
}

const datetimeFrontmatterKeys = ['published_at_utc'];

function renderMarkdownEditor(markdown) {
    markdownEditor.textContent = markdown;
    markdownEditor.contentEditable = 'true';
    markdownEditorDirty = false;
    markdownPreviewButton.disabled = false;
}

function renderAssetFiles(fileNames) {
    assetsList.replaceChildren();

    if (!fileNames.length) {
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'empty-editor-state';
        emptyMessage.textContent = 'Nenhum arquivo .txt encontrado.';
        assetsList.append(emptyMessage);
        return;
    }

    for (const fileName of fileNames) {
        const fileItem = document.createElement('li');
        const fileButton = document.createElement('button');
        fileButton.className = 'asset-file-button';
        fileButton.type = 'button';
        fileButton.dataset.assetName = fileName;

        const icon = document.createElement('i');
        icon.className = 'ri-file-text-line asset-file-icon';
        icon.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.className = 'asset-file-name';
        name.textContent = fileName;

        fileButton.append(icon, name);
        fileItem.append(fileButton);
        assetsList.append(fileItem);
    }
}

async function openAssetDialog(fileName) {
    if (!selectedArticle) {
        return;
    }

    try {
        const assetsHandle = await selectedArticle.articleHandle.getDirectoryHandle('assets');
        const fileHandle = await assetsHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();

        selectedAsset = { assetsHandle, fileHandle, fileName };
        assetDialogTitle.value = fileName;
        assetEditor.value = await file.text();
        assetSaveButton.disabled = false;
        assetDialog.showModal();
        assetEditor.focus();
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível abrir o asset.', 'error');
    }
}

async function openNewAssetDialog() {
    if (!selectedArticle) {
        return;
    }

    try {
        const assetsHandle = await selectedArticle.articleHandle.getDirectoryHandle('assets', { create: true });
        selectedAsset = { assetsHandle, fileHandle: null, fileName: null, isNew: true };
        assetDialogTitle.value = '';
        assetEditor.value = '';
        assetSaveButton.disabled = false;
        assetDeleteButton.disabled = true;
        assetDialog.showModal();
        assetDialogTitle.focus();
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível criar um novo asset.', 'error');
    }
}

async function deleteAsset() {
    if (!selectedAsset || !window.confirm(`Excluir o asset "${selectedAsset.fileName}"?`)) {
        return;
    }

    assetDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir o asset.');
        }

        await selectedAsset.assetsHandle.removeEntry(selectedAsset.fileName);
        const deletedFileName = selectedAsset.fileName;
        selectedAsset = null;
        assetDialog.close();
        await loadAssetFiles(selectedArticle.articleHandle);
        setSidebarStatus(`Asset "${deletedFileName}" excluído.`, 'success');
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível excluir o asset.', 'error');
    } finally {
        assetDeleteButton.disabled = false;
    }
}

async function saveAsset(event) {
    event.preventDefault();
    if (!selectedAsset) {
        return;
    }

    assetSaveButton.disabled = true;
    try {
        const fileName = assetDialogTitle.value.trim();
        if (!fileName) {
            throw new Error('Informe um nome para o asset.');
        }
        if (/[\\/:*?"<>|]/.test(fileName)) {
            throw new Error('O nome do asset contém caracteres inválidos.');
        }

        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar o asset.');
        }

        let fileHandle = selectedAsset.fileHandle;
        if (selectedAsset.isNew || fileName !== selectedAsset.fileName) {
            try {
                await selectedAsset.assetsHandle.getFileHandle(fileName);
                throw new Error(`Já existe um asset chamado "${fileName}".`);
            } catch (error) {
                if (error.name !== 'NotFoundError') {
                    throw error;
                }
            }

            fileHandle = await selectedAsset.assetsHandle.getFileHandle(fileName, { create: true });
        }

        const writable = await fileHandle.createWritable();
        await writable.write(assetEditor.value);
        await writable.close();
        if (!selectedAsset.isNew && fileName !== selectedAsset.fileName) {
            await selectedAsset.assetsHandle.removeEntry(selectedAsset.fileName);
        }

        const previousFileName = selectedAsset.fileName;
        const wasNew = selectedAsset.isNew;
        selectedAsset = { ...selectedAsset, fileHandle, fileName };
        assetDialog.close();
        await loadAssetFiles(selectedArticle.articleHandle);
        setSidebarStatus(wasNew
            ? `Asset "${fileName}" criado.`
            : fileName === previousFileName
                ? `Asset "${fileName}" salvo.`
                : `Asset renomeado de "${previousFileName}" para "${fileName}".`, 'success');
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível salvar o asset.', 'error');
    } finally {
        assetSaveButton.disabled = false;
    }
}

async function loadAssetFiles(articleHandle) {
    try {
        const assetsHandle = await articleHandle.getDirectoryHandle('assets');
        const fileNames = [];

        for await (const [name, handle] of assetsHandle.entries()) {
            if (handle.kind === 'file' && name.toLowerCase().endsWith('.txt')) {
                fileNames.push(name);
            }
        }

        renderAssetFiles(fileNames.sort((first, second) => first.localeCompare(second)));
    } catch (error) {
        renderAssetFiles([]);
    }
}

function renderImageFiles(files) {
    imagesList.replaceChildren();

    if (!files.length) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'image-grid-empty empty-editor-state';
        emptyMessage.textContent = 'Nenhuma imagem encontrada.';
        imagesList.append(emptyMessage);
        return;
    }

    for (const { name, url } of files) {
        const item = document.createElement('div');
        item.className = 'image-grid-item';

        const image = document.createElement('img');
        image.src = url;
        image.alt = name;
        image.loading = 'lazy';
        image.dataset.imageName = name;

        item.append(image);
        imagesList.append(item);
    }
}

function openImageDialog(fileName) {
    const file = currentImageFiles.find(image => image.name === fileName);
    if (!file) {
        return;
    }

    selectedImage = file;
    imageDialogTitle.textContent = file.name;
    imageDialogPreview.src = file.url;
    imageDialogPreview.alt = file.name;
    imageDialog.showModal();
}

async function deleteImage() {
    if (!selectedImage || !window.confirm(`Excluir a imagem "${selectedImage.name}"?`)) {
        return;
    }

    imageDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir a imagem.');
        }

        await selectedImage.imagesHandle.removeEntry(selectedImage.name);
        const deletedName = selectedImage.name;
        selectedImage = null;
        imageDialog.close();
        await loadImageFiles(selectedArticle.articleHandle);
        setSidebarStatus(`Imagem "${deletedName}" excluída.`, 'success');
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível excluir a imagem.', 'error');
    } finally {
        imageDeleteButton.disabled = false;
    }
}

function downloadImage() {
    if (!selectedImage) {
        return;
    }

    const link = document.createElement('a');
    link.href = selectedImage.url;
    link.download = selectedImage.name;
    link.click();
}

async function loadImageFiles(articleHandle) {
    try {
        const imagesHandle = await articleHandle.getDirectoryHandle('images');
        const files = [];

        for await (const [name, handle] of imagesHandle.entries()) {
            if (handle.kind === 'file' && imageFileExtensions.some(extension => name.toLowerCase().endsWith(extension))) {
                const file = await handle.getFile();
                files.push({ name, imagesHandle, url: URL.createObjectURL(file) });
            }
        }

        currentImageFiles = files.sort((first, second) => first.name.localeCompare(second.name));
        renderImageFiles(currentImageFiles);
    } catch (error) {
        renderImageFiles([]);
    }
}

function goToGenerateImages() {
    if (!selectedArticle) {
        return;
    }

    const params = new URLSearchParams({ type: 'articles', content: selectedArticle.folderName });
    location.href = `images.html?${params.toString()}`;
}

function resetArticleEditor() {
    for (const file of currentImageFiles) {
        URL.revokeObjectURL(file.url);
    }

    selectedArticle = null;
    selectedAsset = null;
    selectedImage = null;
    currentImageFiles = [];
    localStorage.removeItem(lastSelectedArticleStorageKey);
    frontmatterPanel.innerHTML = '<div class="empty-editor-state">Selecione um artigo para editar o frontmatter.</div>';
    markdownEditor.textContent = 'Selecione um artigo para editar o conteúdo.';
    markdownEditor.contentEditable = 'false';
    markdownEditorDirty = false;
    markdownPreviewButton.disabled = true;
    renderAssetFiles([]);
    renderImageFiles([]);
    saveArticleButton.disabled = true;
    deleteArticleButton.disabled = true;
    newAssetButton.disabled = true;
    generateImagesButton.disabled = true;
}

async function deleteArticle() {
    if (!selectedArticle || !window.confirm(`Excluir o artigo "${selectedArticle.folderName}" e todo o seu conteúdo?`)) {
        return;
    }

    deleteArticleButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir o artigo.');
        }

        const deletedFolderName = selectedArticle.folderName;
        await selectedArticle.sectionHandle.removeEntry(deletedFolderName, { recursive: true });
        currentArticles = currentArticles.filter(article => article.folderName !== deletedFolderName);
        resetArticleEditor();
        renderArticleList(currentArticles);
        setSidebarStatus(`Artigo "${deletedFolderName}" excluído.`, 'success');
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível excluir o artigo.', 'error');
        deleteArticleButton.disabled = false;
    }
}

function getEditedMarkdown() {
    const markdown = markdownEditor.textContent.trim();
    return markdown ? `${markdown}\n` : '';
}

function renderFrontmatterEditor(frontmatter) {
    frontmatterPanel.replaceChildren();

    if (!frontmatter.entries.length) {
        const message = document.createElement('div');
        message.className = 'empty-editor-state';
        message.textContent = 'Este artigo não possui um frontmatter editável.';
        frontmatterPanel.append(message);
        saveArticleButton.disabled = true;
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
        input.rows = entry.key === 'summary' ? 5 : undefined;

        if (entry.key === 'status') {
            for (const statusValue of articleStatuses) {
                const option = document.createElement('option');
                option.value = statusValue;
                option.textContent = statusValue;
                input.append(option);
            }
        }

        if (datetimeFrontmatterKeys.includes(entry.key)) {
            input.type = 'datetime-local';
        }

        input.value = datetimeFrontmatterKeys.includes(entry.key) ? toDatetimeLocalValue(entry.value) : entry.value;

        label.append(name, input);

        if (entry.key === 'title' || entry.key === 'slug' || entry.key === 'summary') {
            const maxLength = entry.key === 'title'
                ? articleTitleMaxLength
                : entry.key === 'slug'
                    ? articleSlugMaxLength
                    : articleSummaryMaxLength;
            input.maxLength = maxLength;

            const counter = document.createElement('span');
            counter.className = 'frontmatter-counter';
            const updateCounter = () => {
                counter.textContent = `${input.value.length}/${maxLength}`;
            };

            input.addEventListener('input', () => {
                if (entry.key === 'slug') {
                    input.value = sanitizeSlugInput(input.value);
                } else if (input.value.length > maxLength) {
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
    saveArticleButton.disabled = false;
}

async function selectArticle(folderName) {
    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setSidebarStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    try {
        const sectionHandle = await rootHandle.getDirectoryHandle(sectionSlug);
        const articleHandle = await sectionHandle.getDirectoryHandle(folderName);
        const indexFileHandle = await articleHandle.getFileHandle('index.md');
        const indexFile = await indexFileHandle.getFile();
        const markdown = await indexFile.text();
        const frontmatter = parseArticleFrontmatter(markdown);
        selectedArticle = { folderName, sectionHandle, articleHandle, markdown, frontmatter };
        newAssetButton.disabled = false;
        generateImagesButton.disabled = false;
        renderFrontmatterEditor(frontmatter);
        renderMarkdownEditor(frontmatter.body);
        deleteArticleButton.disabled = false;
        await loadAssetFiles(articleHandle);
        await loadImageFiles(articleHandle);
        renderArticleList(currentArticles, folderName);
        localStorage.setItem(lastSelectedArticleStorageKey, folderName);
    } catch (error) {
        localStorage.removeItem(lastSelectedArticleStorageKey);
        setSidebarStatus(error.message || 'Não foi possível abrir o artigo.', 'error');
    }
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

async function renameArticleFolder(sectionHandle, oldFolderName, newFolderName) {
    const newHandle = await sectionHandle.getDirectoryHandle(newFolderName, { create: true });
    const oldHandle = await sectionHandle.getDirectoryHandle(oldFolderName);
    await copyDirectoryContents(oldHandle, newHandle);
    await sectionHandle.removeEntry(oldFolderName, { recursive: true });
    return newHandle;
}

async function saveArticle() {
    if (!selectedArticle) {
        return;
    }

    saveArticleButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar o artigo.');
        }

        const fields = frontmatterPanel.querySelectorAll('[data-frontmatter-key]');
        const values = new Map([...fields].map(field => [field.dataset.frontmatterKey, field.value]));
        for (const key of datetimeFrontmatterKeys) {
            if (values.has(key)) {
                values.set(key, fromDatetimeLocalValue(values.get(key)));
            }
        }
        if (values.has('title')) {
            values.set('title', values.get('title').slice(0, articleTitleMaxLength));
        }
        const newFolderName = values.has('slug') && values.get('slug').trim()
            ? slugify(sanitizeSlugInput(values.get('slug')))
            : selectedArticle.folderName;
        if (values.has('slug')) {
            values.set('slug', newFolderName);
        }

        const frontmatterText = selectedArticle.frontmatter.entries
            .map(entry => `${entry.key}: ${values.get(entry.key) ?? entry.value}`)
            .join('\n');
        const markdown = `---\n${frontmatterText}\n---\n${getEditedMarkdown()}`;

        let articleHandle = selectedArticle.articleHandle;
        const previousFolderName = selectedArticle.folderName;
        if (newFolderName !== previousFolderName) {
            articleHandle = await renameArticleFolder(selectedArticle.sectionHandle, previousFolderName, newFolderName);
        }

        const indexFileHandle = await articleHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();

        selectedArticle.folderName = newFolderName;
        selectedArticle.articleHandle = articleHandle;
        selectedArticle.markdown = markdown;
        selectedArticle.frontmatter = parseArticleFrontmatter(markdown);
        markdownEditorDirty = false;
        currentArticles = currentArticles.map(article => article.folderName === previousFolderName
            ? { folderName: newFolderName, ...extractArticleMetadata(markdown) }
            : article);
        renderArticleList(currentArticles, newFolderName);
        localStorage.setItem(lastSelectedArticleStorageKey, newFolderName);
        setSidebarStatus('Informações do artigo salvas.', 'success');
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível salvar o artigo.', 'error');
    } finally {
        saveArticleButton.disabled = false;
    }
}

const articleTitleMaxLength = 80;
const articleSlugMaxLength = 120;
const articleSummaryMaxLength = 160;

function toDatetimeLocalValue(value) {
    const match = (value || '').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    return match ? match[1] : '';
}

function fromDatetimeLocalValue(value) {
    return value ? `${value}:00Z` : '';
}

function sanitizeSlugInput(text) {
    return text.replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, articleSlugMaxLength);
}

function slugify(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, articleSlugMaxLength);
}

function createArticleTitleAndSlug(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    const currentDateTime = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    const title = `Article ${currentDateTime}`;

    return { title, slug: slugify(title) };
}

function createArticleFrontmatter(organizationId, title, slug) {
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

function normalizeSearchText(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function createArticleStatus(statusValue) {
    if (!articleStatuses.includes(statusValue)) {
        return null;
    }

    const statusGroup = document.createElement('span');
    statusGroup.className = 'sidebar-article-status-group';

    const statusDot = document.createElement('span');
    statusDot.className = `sidebar-article-status-dot sidebar-article-status-dot-${statusValue}`;
    statusDot.setAttribute('aria-hidden', 'true');

    const status = document.createElement('span');
    status.className = 'sidebar-article-status';
    status.textContent = statusValue;

    statusGroup.append(statusDot, status);
    return statusGroup;
}

function renderArticleList(entries, selectedFolderName = null) {
    articleListElement.replaceChildren();

    const normalizedTitleFilter = normalizeSearchText(selectedArticleTitleFilter.trim());
    const filteredEntries = entries.filter(entry => {
        const title = entry.title || entry.folderName;
        const matchesTitle = !normalizedTitleFilter || normalizeSearchText(title).includes(normalizedTitleFilter);
        const matchesStatus = selectedArticleStatusFilter === 'all' || entry.status === selectedArticleStatusFilter;

        return matchesTitle && matchesStatus;
    });

    if (filteredEntries.length === 0) {
        const message = document.createElement('p');
        message.className = 'sidebar-empty-message';
        message.textContent = entries.length === 0 ? 'Nenhum artigo encontrado' : 'Nenhum artigo corresponde aos filtros';
        articleListElement.append(message);
        return;
    }

    for (const entry of filteredEntries) {
        const item = document.createElement('a');
        item.className = 'sidebar-article';
        item.classList.toggle('is-selected', entry.folderName === selectedFolderName);
        item.href = '#';
        item.dataset.folder = entry.folderName;
        item.addEventListener('click', event => {
            event.preventDefault();
            selectArticle(entry.folderName);
        });

        const icon = document.createElement('i');
        icon.className = 'ri-file-text-line sidebar-article-icon';
        icon.setAttribute('aria-hidden', 'true');

        const details = document.createElement('span');
        details.className = 'sidebar-article-details';

        const title = document.createElement('span');
        title.className = 'sidebar-article-title';
        title.textContent = entry.title || entry.folderName;

        const folder = document.createElement('span');
        folder.className = 'sidebar-article-folder';
        folder.textContent = entry.folderName;

        details.append(title, folder);
        const status = createArticleStatus(entry.status);
        if (status) {
            details.append(status);
        }

        item.append(icon, details);
        articleListElement.append(item);

        if (entry.folderName === selectedFolderName) {
            item.scrollIntoView({ block: 'nearest' });
        }
    }
}

async function loadArticles(selectedFolderName = null) {
    articleListElement.replaceChildren();
    setSidebarStatus('Carregando artigos...');

    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setSidebarStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    const permission = await rootHandle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
        setSidebarStatus('Conceda acesso à pasta para carregar os artigos.', 'error');
        return;
    }

    let sectionHandle;
    try {
        sectionHandle = await rootHandle.getDirectoryHandle(sectionSlug);
    } catch (error) {
        setSidebarStatus(`A pasta "${sectionSlug}" não foi encontrada.`, 'error');
        return;
    }

    const subfolders = [];
    for await (const [name, handle] of sectionHandle.entries()) {
        if (handle.kind === 'directory') {
            subfolders.push({ name, handle });
        }
    }

    if (subfolders.length === 0) {
        setSidebarStatus(`A pasta "${sectionSlug}" não contém subpastas.`, 'error');
        return;
    }

    const entries = [];
    for (const folder of subfolders.sort((first, second) => first.name.localeCompare(second.name))) {
        try {
            const indexFileHandle = await folder.handle.getFileHandle('index.md');
            const indexFile = await indexFileHandle.getFile();
            entries.push({ folderName: folder.name, ...extractArticleMetadata(await indexFile.text()) });
        } catch (error) {
            // Cancel the whole load: every subfolder must have an index.md.
            setSidebarStatus(`A subpasta "${folder.name}" precisa conter um arquivo index.md.`, 'error');
            return;
        }
    }

    currentArticles = entries;
    renderArticleList(entries, selectedFolderName);
    if (selectedFolderName) {
        await selectArticle(selectedFolderName);
    }
    setSidebarStatus(selectedFolderName
        ? `Artigo "${selectedFolderName}" criado.`
        : `${entries.length} artigo(s) encontrado(s).`, 'success');
}

async function createArticle() {
    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setSidebarStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        setSidebarStatus('Conceda acesso de escrita à pasta para criar um novo artigo.', 'error');
        return;
    }

    const organizationId = localStorage.getItem('organization_id');
    if (!organizationId) {
        setSidebarStatus('O organization_id da pasta aberta não foi encontrado.', 'error');
        return;
    }

    newArticleButton.disabled = true;
    setSidebarStatus('Criando novo artigo...');

    try {
        const { title, slug } = createArticleTitleAndSlug();
        const sectionHandle = await rootHandle.getDirectoryHandle(sectionSlug, { create: true });
        const articleHandle = await sectionHandle.getDirectoryHandle(slug, { create: true });
        await articleHandle.getDirectoryHandle('images', { create: true });
        await articleHandle.getDirectoryHandle('assets', { create: true });
        const indexFileHandle = await articleHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(createArticleFrontmatter(organizationId, title, slug));
        await writable.close();

        await loadArticles(slug);
    } catch (error) {
        setSidebarStatus(error.message || 'Não foi possível criar o novo artigo.', 'error');
    } finally {
        newArticleButton.disabled = false;
    }
}

loadArticles(localStorage.getItem(lastSelectedArticleStorageKey));

if (newArticleButton) {
    newArticleButton.addEventListener('click', createArticle);
}

articleTitleFilter?.addEventListener('input', () => {
    selectedArticleTitleFilter = articleTitleFilter.value;
    renderArticleList(currentArticles);
});

if (articleStatusFilter) {
    articleStatusFilter.value = selectedArticleStatusFilter;
    articleStatusFilter.addEventListener('change', () => {
        selectedArticleStatusFilter = articleStatusFilter.value;
        localStorage.setItem(articleStatusFilterStorageKey, selectedArticleStatusFilter);
        renderArticleList(currentArticles);
    });
}

saveArticleButton?.addEventListener('click', saveArticle);
deleteArticleButton?.addEventListener('click', deleteArticle);
newAssetButton?.addEventListener('click', openNewAssetDialog);
generateImagesButton?.addEventListener('click', goToGenerateImages);

assetsList?.addEventListener('click', event => {
    const fileButton = event.target.closest('[data-asset-name]');
    if (fileButton) {
        openAssetDialog(fileButton.dataset.assetName);
    }
});

assetDialogForm?.addEventListener('submit', saveAsset);
assetDeleteButton?.addEventListener('click', deleteAsset);
assetDialog?.addEventListener('click', event => {
    if (event.target === assetDialog) {
        selectedAsset = null;
        assetDialog.close();
    }
});

assetCancelButtons.forEach(button => button.addEventListener('click', () => {
    selectedAsset = null;
    assetDialog.close();
}));

imagesList?.addEventListener('click', event => {
    const image = event.target.closest('[data-image-name]');
    if (image) {
        openImageDialog(image.dataset.imageName);
    }
});

imageDeleteButton?.addEventListener('click', deleteImage);
imageDownloadButton?.addEventListener('click', downloadImage);
imageDialogCloseButton?.addEventListener('click', () => {
    selectedImage = null;
    imageDialog.close();
});
imageDialog?.addEventListener('click', event => {
    if (event.target === imageDialog) {
        selectedImage = null;
        imageDialog.close();
    }
});

markdownEditor?.addEventListener('input', () => {
    markdownEditorDirty = true;
});

markdownPreviewButton?.addEventListener('click', () => {
    if (!window.marked || !window.DOMPurify) {
        setSidebarStatus('Não foi possível carregar a prévia Markdown.', 'error');
        return;
    }

    window.marked.use({ gfm: true, breaks: false });
    const renderedMarkdown = window.marked.parse(getEditedMarkdown());
    const sanitizedMarkdown = window.DOMPurify.sanitize(renderedMarkdown);
    markdownPreviewShadowRoot.innerHTML = `
        <style>
            :host {
                display: block;
                padding: calc(var(--spacing) * 5);
                color: var(--color-foreground-default-light);
                font: inherit;
                line-height: 1.6;
            }

            .markdown-preview-document {
                all: initial;
                display: block;
                color: inherit;
                font: inherit;
                line-height: inherit;
                overflow-wrap: anywhere;
            }

            .markdown-preview-document h1,
            .markdown-preview-document h2,
            .markdown-preview-document h3,
            .markdown-preview-document h4,
            .markdown-preview-document h5,
            .markdown-preview-document h6,
            .markdown-preview-document p,
            .markdown-preview-document ul,
            .markdown-preview-document ol,
            .markdown-preview-document blockquote,
            .markdown-preview-document pre,
            .markdown-preview-document table {
                margin: 0 0 1rem;
            }

            .markdown-preview-document h1,
            .markdown-preview-document h2,
            .markdown-preview-document h3,
            .markdown-preview-document h4,
            .markdown-preview-document h5,
            .markdown-preview-document h6 {
                color: inherit;
                font-weight: 700;
                line-height: 1.25;
            }

            .markdown-preview-document h1 {
                font-size: 2rem;
            }

            .markdown-preview-document h2 {
                font-size: 1.5rem;
            }

            .markdown-preview-document h3 {
                font-size: 1.25rem;
            }

            .markdown-preview-document ul,
            .markdown-preview-document ol {
                padding-left: 2rem;
            }

            .markdown-preview-document li + li {
                margin-top: 0.35rem;
            }

            .markdown-preview-document blockquote {
                padding-left: 1rem;
                border-left: 3px solid currentColor;
                opacity: 0.8;
            }

            .markdown-preview-document pre {
                overflow-x: auto;
                padding: 1rem;
                background: rgb(127 127 127 / 14%);
            }

            .markdown-preview-document code {
                font-family: "DM Mono", monospace;
            }

            .markdown-preview-document a {
                color: inherit;
                text-decoration: underline;
            }

            .markdown-preview-document img {
                display: block;
                max-width: 100%;
                height: auto;
            }

            .markdown-preview-document table {
                width: 100%;
                border-collapse: collapse;
            }

            .markdown-preview-document th,
            .markdown-preview-document td {
                padding: 0.5rem;
                border: 1px solid currentColor;
                text-align: left;
            }

            .markdown-preview-document > :last-child {
                margin-bottom: 0;
            }

            :host-context(html.dark) {
                color: var(--color-foreground-default-dark);
            }
        </style>
        <div class="markdown-preview-document">${sanitizedMarkdown}</div>`;
    markdownPreviewDialog.showModal();
});

markdownPreviewCloseButton?.addEventListener('click', () => {
    markdownPreviewDialog.close();
});

markdownPreviewDialog?.addEventListener('click', event => {
    if (event.target === markdownPreviewDialog) {
        markdownPreviewDialog.close();
    }
});

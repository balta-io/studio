const snippetsListElement = document.querySelector('[data-snippets-list]');
const snippetsStatusElement = document.querySelector('[data-snippets-status]');
const newSnippetButton = document.querySelector('#new-snippet-button');
const frontmatterPanel = document.querySelector('[data-frontmatter-panel]');
const markdownEditor = document.querySelector('[data-markdown-editor]');
const snippetLanguageSelect = document.querySelector('[data-snippet-language]');
const saveSnippetButton = document.querySelector('[data-save-snippet]');
const deleteSnippetButton = document.querySelector('[data-delete-snippet]');
const snippetPreviewButton = document.querySelector('[data-snippet-preview]');
const snippetAssetsList = document.querySelector('[data-snippet-assets-list]');
const newSnippetAssetButton = document.querySelector('[data-new-snippet-asset]');
const snippetImagesList = document.querySelector('[data-snippet-images-list]');
const snippetAssetDialog = document.querySelector('[data-snippet-asset-dialog]');
const snippetAssetForm = document.querySelector('[data-snippet-asset-form]');
const snippetAssetDialogTitle = document.querySelector('[data-snippet-asset-dialog-title]');
const snippetAssetEditor = document.querySelector('[data-snippet-asset-editor]');
const snippetAssetDeleteButton = document.querySelector('[data-snippet-asset-delete]');
const snippetPreviewDialog = document.querySelector('[data-snippet-preview-dialog]');
const snippetPreviewCloseButton = document.querySelector('[data-snippet-preview-close]');
const snippetExportButton = document.querySelector('[data-snippet-export]');
const snippetSaveImageButton = document.querySelector('[data-snippet-save-image]');
const snippetImageDialog = document.querySelector('[data-snippet-image-dialog]');
const snippetImageDialogTitle = document.querySelector('[data-snippet-image-dialog-title]');
const snippetImageDialogPreview = document.querySelector('[data-snippet-image-dialog-preview]');
const snippetImageDialogCloseButton = document.querySelector('[data-snippet-image-dialog-close]');
const snippetImageDeleteButton = document.querySelector('[data-snippet-image-delete]');
const snippetImageRegenerateButton = document.querySelector('[data-snippet-image-regenerate]');
const snippetImageDownloadButton = document.querySelector('[data-snippet-image-download]');
const snippetCanvas = document.querySelector('[data-snippet-canvas]');
const snippetCanvasEmpty = document.querySelector('[data-snippet-canvas-empty]');
const snippetStatuses = ['backlog', 'todo', 'draft', 'ready', 'scheduled', 'published'];
const snippetConfig = {
    collectionFolderName: 'snippets',
    storageKey: 'studio-snippets-last-snippet',
    singularLabel: 'snippet',
    pluralLabel: 'snippets',
    titlePrefix: 'Snippet',
    slugPrefix: 'snippet',
    templateImageFile: 'snippet.png',
    listIconClass: 'ri-code-s-slash-line',
    ...window.studioSnippetsConfig
};
const lastSelectedSnippetStorageKey = snippetConfig.storageKey;
let selectedSnippet = null;
let selectedSnippetAsset = null;
let markdownEditorDirty = false;
let snippetTemplateImage = null;
let prismLanguageManifest = null;
const prismLanguageLoaders = new Map();
const prismLanguageAliases = new Map([
    ['html', 'markup'],
    ['svg', 'markup'],
    ['xml', 'markup'],
    ['js', 'javascript'],
    ['ts', 'typescript']
]);
let currentSnippetImageFiles = [];
let selectedSnippetImage = null;

const snippetCanvasText = {
    x: 189,
    y: 569,
    width: 709,
    height: 581,
    fontSize: 24,
    lineHeight: 28.8,
    color: '#C4C4C4'
};

const prismTokenColors = {
    comment: '#6A9955',
    prolog: '#6A9955',
    doctype: '#6A9955',
    cdata: '#6A9955',
    punctuation: '#D4D4D4',
    property: '#9CDCFE',
    tag: '#569CD6',
    boolean: '#569CD6',
    number: '#B5CEA8',
    constant: '#4FC1FF',
    symbol: '#4FC1FF',
    selector: '#D7BA7D',
    'attr-name': '#9CDCFE',
    string: '#CE9178',
    char: '#CE9178',
    builtin: '#4EC9B0',
    inserted: '#B5CEA8',
    operator: '#D4D4D4',
    entity: '#D7BA7D',
    url: '#D7BA7D',
    variable: '#9CDCFE',
    keyword: '#C586C0',
    function: '#DCDCAA',
    regex: '#D16969',
    important: '#569CD6',
    deleted: '#D16969'
};

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
    const imageHandle = await templatesHandle.getFileHandle(snippetConfig.templateImageFile);
    const imageFile = await imageHandle.getFile();
    const imageUrl = URL.createObjectURL(imageFile);
    const image = new Image();

    image.addEventListener('load', () => {
        snippetTemplateImage = image;
        snippetCanvas.width = image.naturalWidth;
        snippetCanvas.height = image.naturalHeight;
        renderSnippetCanvas();
        snippetPreviewButton.disabled = false;
        snippetCanvasEmpty.hidden = true;
        URL.revokeObjectURL(imageUrl);
    }, { once: true });
    image.src = imageUrl;
}

function getPrismLanguageId(language) {
    const normalizedLanguage = (language || 'csharp').toLowerCase();
    if (prismLanguageAliases.has(normalizedLanguage)) {
        return prismLanguageAliases.get(normalizedLanguage);
    }
    if (prismLanguageManifest?.languages[normalizedLanguage]) {
        return normalizedLanguage;
    }

    const languageEntry = Object.entries(prismLanguageManifest?.languages || {})
        .find(([, definition]) => {
            const aliases = Array.isArray(definition.alias) ? definition.alias : [definition.alias];
            return aliases.includes(normalizedLanguage);
        });
    return languageEntry?.[0] || normalizedLanguage;
}

function getPrismLanguage(language) {
    const languageId = getPrismLanguageId(language);
    return Prism.languages[languageId] || Prism.languages.markup;
}

function loadPrismScript(languageId, path) {
    if (prismLanguageLoaders.has(languageId)) {
        return prismLanguageLoaders.get(languageId);
    }

    const loader = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://cdn.jsdelivr.net/npm/prismjs@1.29.0/${path}`;
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', () => reject(new Error(`Não foi possível carregar ${languageId}.`)), { once: true });
        document.head.append(script);
    });
    prismLanguageLoaders.set(languageId, loader);
    return loader;
}

async function loadPrismLanguage(languageId) {
    const resolvedLanguageId = getPrismLanguageId(languageId);
    if (Prism.languages[resolvedLanguageId]) {
        return Prism.languages[resolvedLanguageId];
    }

    const language = prismLanguageManifest?.languages[resolvedLanguageId];
    if (!language) {
        throw new Error(`A linguagem "${languageId}" não está disponível.`);
    }

    const requirements = Array.isArray(language.require) ? language.require : [language.require];
    for (const requirement of requirements.filter(Boolean)) {
        await loadPrismLanguage(requirement);
    }
    await loadPrismScript(resolvedLanguageId, `components/prism-${resolvedLanguageId}.min.js`);
    if (!Prism.languages[resolvedLanguageId]) {
        throw new Error(`A linguagem "${languageId}" não pôde ser carregada.`);
    }
    return Prism.languages[resolvedLanguageId];
}

async function initializePrismLanguages() {
    try {
        const response = await fetch('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components.json');
        if (!response.ok) {
            throw new Error('Não foi possível obter as linguagens do Prism.');
        }
        prismLanguageManifest = await response.json();
        const languages = Object.entries(prismLanguageManifest.languages)
            .filter(([, language]) => language.title)
            .sort(([, first], [, second]) => first.title.localeCompare(second.title));
        snippetLanguageSelect.replaceChildren();
        for (const [languageId, language] of languages) {
            const option = document.createElement('option');
            option.value = languageId;
            option.textContent = language.title;
            snippetLanguageSelect.append(option);
        }
        const xmlOption = document.createElement('option');
        xmlOption.value = 'xml';
        xmlOption.textContent = 'XML';
        snippetLanguageSelect.append(xmlOption);
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível carregar as linguagens.', 'error');
        const fallbackOption = document.createElement('option');
        fallbackOption.value = 'csharp';
        fallbackOption.textContent = 'C#';
        snippetLanguageSelect.replaceChildren(fallbackOption);
    }

    snippetLanguageSelect.value = 'csharp';
    snippetLanguageSelect.disabled = false;
    await loadPrismLanguage('csharp');
    renderSnippetCanvas();
}

function drawPrismTokens(context, tokens, x, y, maxWidth) {
    let currentX = x;
    let currentY = y;

    const appendText = (text, color) => {
        for (const part of text.split(/(\n)/)) {
            if (part === '\n') {
                currentX = x;
                currentY += snippetCanvasText.lineHeight;
                continue;
            }

            const words = part.split(/(\s+)/);
            for (const word of words) {
                const width = context.measureText(word).width;
                if (currentX > x && currentX + width > x + maxWidth) {
                    currentX = x;
                    currentY += snippetCanvasText.lineHeight;
                }
                context.fillStyle = color;
                context.fillText(word, currentX, currentY);
                currentX += width;
            }
        }
    };

    const drawToken = (token, inheritedColor = snippetCanvasText.color) => {
        if (Array.isArray(token)) {
            for (const nestedToken of token) {
                drawToken(nestedToken, inheritedColor);
            }
            return;
        }

        if (typeof token === 'string') {
            appendText(token, inheritedColor);
        } else {
            const tokenColor = prismTokenColors[token.type] || inheritedColor;
            if (Array.isArray(token.content)) {
                for (const nestedToken of token.content) {
                    drawToken(nestedToken, tokenColor);
                }
            } else {
                appendText(token.content, tokenColor);
            }
        }
    };

    for (const token of tokens) {
        drawToken(token);
    }

    return currentY;
}

function drawCanvasText(context, text, x, y, width) {
    context.fillStyle = snippetCanvasText.color;
    for (const line of text.split(/\r?\n/)) {
        const words = line.split(/(\s+)/);
        let currentX = x;
        for (const word of words) {
            const wordWidth = context.measureText(word).width;
            if (currentX > x && currentX + wordWidth > x + width) {
                currentX = x;
                y += snippetCanvasText.lineHeight;
            }
            context.fillText(word, currentX, y);
            currentX += wordWidth;
        }
        y += snippetCanvasText.lineHeight;
    }
    return y;
}

function renderSnippetCanvas() {
    if (!snippetTemplateImage || !snippetCanvas) {
        return;
    }

    const context = snippetCanvas.getContext('2d');
    context.clearRect(0, 0, snippetCanvas.width, snippetCanvas.height);
    context.drawImage(snippetTemplateImage, 0, 0);
    context.save();
    context.beginPath();
    context.rect(snippetCanvasText.x, snippetCanvasText.y, snippetCanvasText.width, snippetCanvasText.height);
    context.clip();
    context.font = `400 ${snippetCanvasText.fontSize}px "DM Mono", monospace`;
    context.textBaseline = 'top';

    const markdown = markdownEditor?.value || '';
    const tokens = Prism.tokenize(markdown, getPrismLanguage(snippetLanguageSelect?.value));
    drawPrismTokens(context, tokens, snippetCanvasText.x, snippetCanvasText.y, snippetCanvasText.width);
    context.restore();
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Não foi possível gerar a imagem.'));
            }
        }, 'image/png');
    });
}

function getSnippetSlug() {
    return frontmatterPanel.querySelector('[data-frontmatter-key="slug"]')?.value.trim()
        || selectedSnippet?.name;
}

function exportSnippetImage() {
    if (!snippetCanvas || !selectedSnippet) {
        return;
    }

    snippetCanvas.toBlob(blob => {
        if (!blob) {
            setSnippetsStatus('Não foi possível exportar a imagem.', 'error');
            return;
        }

        const imageUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `${getSnippetSlug()}.PNG`;
        link.click();
        URL.revokeObjectURL(imageUrl);
    }, 'image/png');
}

async function saveSnippetImage() {
    if (!selectedSnippet || !snippetCanvas) {
        return;
    }

    snippetSaveImageButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar a imagem.');
        }

        const slug = getSnippetSlug();
        if (!slug) {
            throw new Error(`O ${snippetConfig.singularLabel} não possui um slug para nomear a imagem.`);
        }

        const imagesHandle = await selectedSnippet.handle.getDirectoryHandle('images', { create: true });
        const imageFileHandle = await imagesHandle.getFileHandle(`${slug}.PNG`, { create: true });
        const writable = await imageFileHandle.createWritable();
        await writable.write(await canvasToBlob(snippetCanvas));
        await writable.close();
        await loadSnippetImageFiles(selectedSnippet.handle);
        setSnippetsStatus(`Imagem "${slug}.PNG" salva.`, 'success');
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível salvar a imagem.', 'error');
    } finally {
        snippetSaveImageButton.disabled = false;
    }
}

function renderSnippetAssetFiles(items) {
    snippetAssetsList.replaceChildren();

    if (!items.length) {
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'empty-editor-state';
        emptyMessage.textContent = 'Nenhum asset encontrado.';
        snippetAssetsList.append(emptyMessage);
        return;
    }

    for (const item of items) {
        const fileItem = document.createElement('li');
        const fileButton = document.createElement('button');
        fileButton.className = 'asset-file-button';
        fileButton.type = 'button';
        fileButton.dataset.assetName = item.name;
        fileButton.dataset.assetKind = item.kind;

        const icon = document.createElement('i');
        icon.className = `${item.kind === 'directory' ? 'ri-folder-line' : 'ri-file-line'} asset-file-icon`;
        icon.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.className = 'asset-file-name';
        name.textContent = item.name;

        fileButton.append(icon, name);
        fileItem.append(fileButton);
        snippetAssetsList.append(fileItem);
    }
}

async function openSnippetAssetDialog(fileName) {
    if (!selectedSnippet) {
        return;
    }

    try {
        const assetsHandle = await selectedSnippet.handle.getDirectoryHandle('assets');
        const fileHandle = await assetsHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();

        selectedSnippetAsset = { assetsHandle, fileHandle, fileName };
        snippetAssetDialogTitle.value = fileName;
        snippetAssetEditor.value = await file.text();
        snippetAssetDeleteButton.disabled = false;
        snippetAssetDialog.showModal();
        snippetAssetEditor.focus();
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível abrir o asset.', 'error');
    }
}

async function openNewSnippetAssetDialog() {
    if (!selectedSnippet) {
        return;
    }

    try {
        const assetsHandle = await selectedSnippet.handle.getDirectoryHandle('assets', { create: true });
        selectedSnippetAsset = { assetsHandle, fileHandle: null, fileName: null, isNew: true };
        snippetAssetDialogTitle.value = '';
        snippetAssetEditor.value = '';
        snippetAssetDeleteButton.disabled = true;
        snippetAssetDialog.showModal();
        snippetAssetDialogTitle.focus();
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível criar um novo asset.', 'error');
    }
}

async function deleteSnippetAsset() {
    if (!selectedSnippet || !selectedSnippetAsset || !window.confirm(`Excluir o asset "${selectedSnippetAsset.fileName}"?`)) {
        return;
    }

    snippetAssetDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir o asset.');
        }

        await selectedSnippetAsset.assetsHandle.removeEntry(selectedSnippetAsset.fileName);
        const deletedFileName = selectedSnippetAsset.fileName;
        selectedSnippetAsset = null;
        snippetAssetDialog.close();
        await loadSnippetAssetFiles(selectedSnippet.handle);
        setSnippetsStatus(`Asset "${deletedFileName}" excluído.`, 'success');
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível excluir o asset.', 'error');
    } finally {
        snippetAssetDeleteButton.disabled = false;
    }
}

async function saveSnippetAsset(event) {
    event.preventDefault();
    if (!selectedSnippet || !selectedSnippetAsset) {
        return;
    }

    try {
        const fileName = snippetAssetDialogTitle.value.trim();
        if (!fileName) {
            throw new Error('Informe um nome para o asset.');
        }
        if (/[\\/:*?"<>|]/.test(fileName)) {
            throw new Error('O nome do asset contém caracteres inválidos.');
        }

        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar o asset.');
        }

        let fileHandle = selectedSnippetAsset.fileHandle;
        if (selectedSnippetAsset.isNew || fileName !== selectedSnippetAsset.fileName) {
            try {
                await selectedSnippetAsset.assetsHandle.getFileHandle(fileName);
                throw new Error(`Já existe um asset chamado "${fileName}".`);
            } catch (error) {
                if (error.name !== 'NotFoundError') {
                    throw error;
                }
            }

            fileHandle = await selectedSnippetAsset.assetsHandle.getFileHandle(fileName, { create: true });
        }

        const writable = await fileHandle.createWritable();
        await writable.write(snippetAssetEditor.value);
        await writable.close();
        if (!selectedSnippetAsset.isNew && fileName !== selectedSnippetAsset.fileName) {
            await selectedSnippetAsset.assetsHandle.removeEntry(selectedSnippetAsset.fileName);
        }

        const previousFileName = selectedSnippetAsset.fileName;
        const wasNew = selectedSnippetAsset.isNew;
        selectedSnippetAsset = { ...selectedSnippetAsset, fileHandle, fileName, isNew: false };
        snippetAssetDialog.close();
        await loadSnippetAssetFiles(selectedSnippet.handle);
        setSnippetsStatus(wasNew
            ? `Asset "${fileName}" criado.`
            : fileName === previousFileName
                ? `Asset "${fileName}" salvo.`
                : `Asset renomeado de "${previousFileName}" para "${fileName}".`, 'success');
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível salvar o asset.', 'error');
    }
}

async function loadSnippetAssetFiles(snippetHandle) {
    try {
        const assetsHandle = await snippetHandle.getDirectoryHandle('assets');
        const items = [];

        for await (const [name, handle] of assetsHandle.entries()) {
            items.push({ name, kind: handle.kind });
        }

        renderSnippetAssetFiles(items.sort((first, second) => first.name.localeCompare(second.name)));
    } catch (error) {
        renderSnippetAssetFiles([]);
    }
}

function revokeSnippetImageUrls() {
    for (const file of currentSnippetImageFiles) {
        URL.revokeObjectURL(file.url);
    }
    currentSnippetImageFiles = [];
}

function renderSnippetImageFiles(files) {
    snippetImagesList.replaceChildren();

    if (!files.length) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'image-grid-empty empty-editor-state';
        emptyMessage.textContent = 'Nenhuma imagem PNG encontrada.';
        snippetImagesList.append(emptyMessage);
        return;
    }

    for (const { name, url } of files) {
        const item = document.createElement('div');
        item.className = 'image-grid-item';

        const button = document.createElement('button');
        button.className = 'image-template-button';
        button.type = 'button';
        button.dataset.snippetImageName = name;
        button.setAttribute('aria-label', `Abrir imagem ${name}`);

        const image = document.createElement('img');
        image.src = url;
        image.alt = name;
        image.loading = 'lazy';
        image.dataset.imageName = name;

        button.append(image);
        item.append(button);
        snippetImagesList.append(item);
    }
}

function openSnippetImageDialog(fileName) {
    const file = currentSnippetImageFiles.find(image => image.name === fileName);
    if (!file) {
        return;
    }

    selectedSnippetImage = file;
    snippetImageDialogTitle.textContent = file.name;
    snippetImageDialogPreview.src = file.url;
    snippetImageDialogPreview.alt = file.name;
    snippetImageDialog.showModal();
}

async function deleteSnippetImage() {
    if (!selectedSnippet || !selectedSnippetImage || !window.confirm(`Excluir a imagem "${selectedSnippetImage.name}"?`)) {
        return;
    }

    snippetImageDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir a imagem.');
        }

        await selectedSnippetImage.imagesHandle.removeEntry(selectedSnippetImage.name);
        const deletedName = selectedSnippetImage.name;
        selectedSnippetImage = null;
        snippetImageDialog.close();
        await loadSnippetImageFiles(selectedSnippet.handle);
        setSnippetsStatus(`Imagem "${deletedName}" excluída.`, 'success');
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível excluir a imagem.', 'error');
    } finally {
        snippetImageDeleteButton.disabled = false;
    }
}

function openSnippetGenerateDialog() {
    snippetCanvas.hidden = false;
    snippetPreviewDialog.showModal();
}

function regenerateSnippetImage() {
    snippetImageDialog.close();
    openSnippetGenerateDialog();
}

function downloadSnippetImage() {
    if (!selectedSnippetImage) {
        return;
    }

    const link = document.createElement('a');
    link.href = selectedSnippetImage.url;
    link.download = selectedSnippetImage.name;
    link.click();
}

async function loadSnippetImageFiles(snippetHandle) {
    revokeSnippetImageUrls();

    try {
        const imagesHandle = await snippetHandle.getDirectoryHandle('images');
        const files = [];

        for await (const [name, handle] of imagesHandle.entries()) {
            if (handle.kind === 'file' && name.toLowerCase().endsWith('.png')) {
                const file = await handle.getFile();
                files.push({ name, imagesHandle, url: URL.createObjectURL(file) });
            }
        }

        currentSnippetImageFiles = files.sort((first, second) => first.name.localeCompare(second.name));
        renderSnippetImageFiles(currentSnippetImageFiles);
    } catch (error) {
        renderSnippetImageFiles([]);
    }
}

function renderSnippetList(snippets, selectedSnippetName = null) {
    snippetsListElement.replaceChildren();

    if (!snippets.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'sidebar-empty-message';
        emptyMessage.textContent = `Nenhum ${snippetConfig.singularLabel} encontrado.`;
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
        icon.className = `${snippetConfig.listIconClass} sidebar-article-icon`;
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
    setSnippetsStatus(`Carregando ${snippetConfig.pluralLabel}...`);

    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        setSnippetsStatus('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.', 'error');
        return;
    }

    const permission = await rootHandle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
        setSnippetsStatus(`Conceda acesso à pasta para carregar os ${snippetConfig.pluralLabel}.`, 'error');
        return;
    }

    let snippetsHandle;
    try {
        snippetsHandle = await rootHandle.getDirectoryHandle(snippetConfig.collectionFolderName);
    } catch (error) {
        setSnippetsStatus(`A pasta "${snippetConfig.collectionFolderName}" não foi encontrada.`, 'error');
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
    setSnippetsStatus(formatSnippetCount(snippets.length), 'success');
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
        message.textContent = `Este ${snippetConfig.singularLabel} não possui um frontmatter editável.`;
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
    renderSnippetCanvas();
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
        const snippetsHandle = await rootHandle.getDirectoryHandle(snippetConfig.collectionFolderName);
        const snippetHandle = await snippetsHandle.getDirectoryHandle(snippetName);
        const indexFileHandle = await snippetHandle.getFileHandle('index.md');
        const markdown = await (await indexFileHandle.getFile()).text();
        const frontmatter = parseSnippetFrontmatter(markdown);

        selectedSnippet = { name: snippetName, handle: snippetHandle, frontmatter };
        selectedSnippetAsset = null;
        localStorage.setItem(lastSelectedSnippetStorageKey, snippetName);
        renderFrontmatterEditor(frontmatter);
        renderMarkdownEditor(frontmatter.body);
        await loadSnippetAssetFiles(snippetHandle);
        await loadSnippetImageFiles(snippetHandle);
        newSnippetAssetButton.disabled = false;
        deleteSnippetButton.disabled = false;
        renderSnippetList([...snippetsListElement.querySelectorAll('[data-snippet-name]')]
            .map(item => ({ folderName: item.dataset.snippetName, title: item.querySelector('.sidebar-article-title').textContent })), snippetName);
    } catch (error) {
        setSnippetsStatus(error.message || `Não foi possível abrir o ${snippetConfig.singularLabel}.`, 'error');
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
            throw new Error(`Conceda acesso de escrita à pasta para salvar o ${snippetConfig.singularLabel}.`);
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
            const snippetsHandle = await rootHandle.getDirectoryHandle(snippetConfig.collectionFolderName);
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
        setSnippetsStatus(`${snippetConfig.titlePrefix} "${newFolderName}" salvo.`, 'success');
    } catch (error) {
        setSnippetsStatus(error.message || `Não foi possível salvar o ${snippetConfig.singularLabel}.`, 'error');
    } finally {
        saveSnippetButton.disabled = false;
    }
}

async function deleteSnippet() {
    if (!selectedSnippet || !window.confirm(`Excluir o ${snippetConfig.singularLabel} "${selectedSnippet.name}" e todo o seu conteúdo?`)) {
        return;
    }

    deleteSnippetButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error(`Conceda acesso de escrita à pasta para excluir o ${snippetConfig.singularLabel}.`);
        }

        const deletedFolderName = selectedSnippet.name;
        const snippetsHandle = await rootHandle.getDirectoryHandle(snippetConfig.collectionFolderName);
        await snippetsHandle.removeEntry(deletedFolderName, { recursive: true });
        selectedSnippet = null;
        selectedSnippetAsset = null;
        selectedSnippetImage = null;
        localStorage.removeItem(lastSelectedSnippetStorageKey);
        frontmatterPanel.replaceChildren();
        markdownEditor.value = `Selecione um ${snippetConfig.singularLabel} para editar o conteúdo.`;
        markdownEditor.disabled = true;
        renderSnippetAssetFiles([]);
        newSnippetAssetButton.disabled = true;
        revokeSnippetImageUrls();
        renderSnippetImageFiles([]);
        saveSnippetButton.disabled = true;
        snippetPreviewButton.disabled = true;
        await loadSnippets();
        setSnippetsStatus(`${snippetConfig.titlePrefix} "${deletedFolderName}" excluído.`, 'success');
    } catch (error) {
        setSnippetsStatus(error.message || `Não foi possível excluir o ${snippetConfig.singularLabel}.`, 'error');
        deleteSnippetButton.disabled = false;
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
    const title = `${snippetConfig.titlePrefix} - ${datePart} ${timePart.replaceAll('-', ':')}`;
    const slug = `${snippetConfig.slugPrefix}_${datePart}_${timePart}`;

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
        setSnippetsStatus(`Conceda acesso de escrita à pasta para criar um ${snippetConfig.singularLabel}.`, 'error');
        return;
    }

    const organizationId = localStorage.getItem('organization_id');
    if (!organizationId) {
        setSnippetsStatus('O organization_id da pasta aberta não foi encontrado.', 'error');
        return;
    }

    newSnippetButton.disabled = true;
    setSnippetsStatus(`Criando novo ${snippetConfig.singularLabel}...`);

    try {
        const { title, slug } = createSnippetTitleAndSlug();
        const snippetsHandle = await rootHandle.getDirectoryHandle(snippetConfig.collectionFolderName, { create: true });
        const snippetHandle = await snippetsHandle.getDirectoryHandle(slug, { create: true });
        await snippetHandle.getDirectoryHandle('assets', { create: true });
        await snippetHandle.getDirectoryHandle('images', { create: true });
        const indexFileHandle = await snippetHandle.getFileHandle('index.md', { create: true });
        const writable = await indexFileHandle.createWritable();
        await writable.write(createSnippetFrontmatter(organizationId, title, slug));
        await writable.close();

        await loadSnippets(slug);
    } catch (error) {
        setSnippetsStatus(error.message || `Não foi possível criar o novo ${snippetConfig.singularLabel}.`, 'error');
    } finally {
        newSnippetButton.disabled = false;
    }
}

loadSnippets(localStorage.getItem(lastSelectedSnippetStorageKey)).catch(error => {
    setSnippetsStatus(error.message || `Não foi possível carregar os ${snippetConfig.pluralLabel}.`, 'error');
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
deleteSnippetButton?.addEventListener('click', deleteSnippet);
markdownEditor?.addEventListener('input', () => {
    markdownEditorDirty = true;
    renderSnippetCanvas();
});
markdownEditor?.addEventListener('keydown', event => {
    if (event.key !== 'Tab') {
        return;
    }

    event.preventDefault();
    const indentation = '    ';
    const value = markdownEditor.value;
    const selectionStart = markdownEditor.selectionStart;
    const selectionEnd = markdownEditor.selectionEnd;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineEndIndex = value.indexOf('\n', selectionEnd);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const selectedLines = value.slice(lineStart, lineEnd).split('\n');
    const isMultipleLines = selectedLines.length > 1 || selectionStart !== selectionEnd;

    if (!isMultipleLines) {
        markdownEditor.setRangeText(indentation, selectionStart, selectionEnd, 'end');
    } else if (event.shiftKey) {
        let removedIndentation = 0;
        const unindentedLines = selectedLines.map(line => {
            if (line.startsWith(indentation)) {
                removedIndentation += indentation.length;
                return line.slice(indentation.length);
            }
            if (line.startsWith('\t')) {
                removedIndentation += 1;
                return line.slice(1);
            }
            return line;
        });
        markdownEditor.setRangeText(unindentedLines.join('\n'), lineStart, lineEnd, 'select');
        markdownEditor.selectionStart = Math.max(lineStart, selectionStart - removedIndentation);
        markdownEditor.selectionEnd = Math.max(lineStart, selectionEnd - removedIndentation);
    } else {
        const indentedText = selectedLines.map(line => `${indentation}${line}`).join('\n');
        markdownEditor.setRangeText(indentedText, lineStart, lineEnd, 'select');
        markdownEditor.selectionStart = selectionStart + indentation.length;
        markdownEditor.selectionEnd = selectionEnd + indentation.length * selectedLines.length;
    }

    markdownEditorDirty = true;
    renderSnippetCanvas();
});
snippetLanguageSelect?.addEventListener('change', async () => {
    try {
        await loadPrismLanguage(snippetLanguageSelect.value);
        renderSnippetCanvas();
    } catch (error) {
        setSnippetsStatus(error.message || 'Não foi possível aplicar a linguagem.', 'error');
    }
});
snippetPreviewButton?.addEventListener('click', () => {
    openSnippetGenerateDialog();
});
snippetPreviewCloseButton?.addEventListener('click', () => {
    snippetPreviewDialog.close();
});
newSnippetAssetButton?.addEventListener('click', openNewSnippetAssetDialog);
snippetAssetsList?.addEventListener('click', event => {
    const button = event.target.closest('[data-asset-name]');
    if (button?.dataset.assetKind === 'file') {
        openSnippetAssetDialog(button.dataset.assetName);
    } else if (button) {
        setSnippetsStatus('Este asset não é um arquivo editável.', 'error');
    }
});
snippetAssetForm?.addEventListener('submit', saveSnippetAsset);
snippetAssetDeleteButton?.addEventListener('click', deleteSnippetAsset);
document.querySelectorAll('[data-snippet-asset-cancel]').forEach(button => {
    button.addEventListener('click', () => {
        selectedSnippetAsset = null;
        snippetAssetDialog.close();
    });
});
snippetImagesList?.addEventListener('click', event => {
    const button = event.target.closest('[data-snippet-image-name]');
    if (button) {
        openSnippetImageDialog(button.dataset.snippetImageName);
    }
});
snippetImageDialogCloseButton?.addEventListener('click', () => {
    snippetImageDialog.close();
});
snippetImageDeleteButton?.addEventListener('click', deleteSnippetImage);
snippetImageRegenerateButton?.addEventListener('click', regenerateSnippetImage);
snippetImageDownloadButton?.addEventListener('click', downloadSnippetImage);
snippetExportButton?.addEventListener('click', exportSnippetImage);
snippetSaveImageButton?.addEventListener('click', saveSnippetImage);

initializePrismLanguages();

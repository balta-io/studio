const templatesGrid = document.querySelector('[data-templates-grid]');
const templatesCount = document.querySelector('[data-templates-count]');
const pageStatus = document.querySelector('[data-page-status]');

const templateImageDialog = document.querySelector('[data-template-image-dialog]');
const templateImageDialogTitle = document.querySelector('[data-template-image-dialog-title]');
const templateImageDialogPreview = document.querySelector('[data-template-image-dialog-preview]');
const templateImageDialogCloseButton = document.querySelector('[data-template-image-dialog-close]');
const templateImageDeleteButton = document.querySelector('[data-template-image-delete]');
const templateImageEditButton = document.querySelector('[data-template-image-edit]');

let templatesDirectoryHandle = null;
let currentTemplateFiles = [];
let selectedTemplateFile = null;
let pageStatusTimer = null;

function setPageStatus(message, type = '') {
    if (pageStatusTimer) {
        clearTimeout(pageStatusTimer);
        pageStatusTimer = null;
    }

    pageStatus.querySelector('.folder-status-message').textContent = message;
    pageStatus.dataset.type = type;
    pageStatus.dataset.visible = String(Boolean(message));
    pageStatus.setAttribute('aria-hidden', String(!message));
    pageStatus.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';

    if (message && type === 'success') {
        pageStatusTimer = setTimeout(() => setPageStatus(''), 4000);
    }
}

function revokeTemplateImageUrls() {
    for (const file of currentTemplateFiles) {
        URL.revokeObjectURL(file.url);
    }
    currentTemplateFiles = [];
}

function renderTemplatesGrid(files) {
    templatesGrid.replaceChildren();
    templatesCount.textContent = `${files.length} ${files.length === 1 ? 'template' : 'templates'}`;

    if (!files.length) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'articles-empty-state';
        emptyMessage.textContent = 'Nenhum template PNG encontrado.';
        templatesGrid.append(emptyMessage);
        return;
    }

    for (const { name, url } of files) {
        const card = document.createElement('button');
        card.className = 'template-card';
        card.type = 'button';
        card.dataset.templateName = name;
        card.setAttribute('aria-label', `Abrir template ${name}`);

        const image = document.createElement('img');
        image.className = 'template-card-thumb';
        image.src = url;
        image.alt = name;
        image.loading = 'lazy';

        const caption = document.createElement('span');
        caption.className = 'template-card-name';
        caption.textContent = name;

        card.append(image, caption);
        templatesGrid.append(card);
    }
}

async function loadTemplateFiles() {
    revokeTemplateImageUrls();

    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const assetsHandle = await rootHandle.getDirectoryHandle('_assets');
        templatesDirectoryHandle = await assetsHandle.getDirectoryHandle('templates');
        const files = [];

        for await (const [name, handle] of templatesDirectoryHandle.entries()) {
            if (handle.kind === 'file' && name.toLowerCase().endsWith('.png')) {
                const file = await handle.getFile();
                files.push({ name, url: URL.createObjectURL(file) });
            }
        }

        currentTemplateFiles = files.sort((first, second) => first.name.localeCompare(second.name));
        renderTemplatesGrid(currentTemplateFiles);
    } catch (error) {
        renderTemplatesGrid([]);
        setPageStatus(error.message || 'Não foi possível carregar os templates.', 'error');
    }
}

function openTemplateImageDialog(fileName) {
    const file = currentTemplateFiles.find(template => template.name === fileName);
    if (!file) {
        return;
    }

    selectedTemplateFile = file;
    templateImageDialogTitle.textContent = file.name;
    templateImageDialogPreview.src = file.url;
    templateImageDialogPreview.alt = file.name;
    templateImageDialog.showModal();
}

async function deleteTemplateImage() {
    if (!selectedTemplateFile || !templatesDirectoryHandle
        || !window.confirm(`Excluir o template "${selectedTemplateFile.name}"?`)) {
        return;
    }

    templateImageDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir o template.');
        }

        const deletedName = selectedTemplateFile.name;
        await templatesDirectoryHandle.removeEntry(deletedName);

        const jsonName = deletedName.replace(/\.png$/i, '.json');
        try {
            await templatesDirectoryHandle.removeEntry(jsonName);
        } catch (error) {
            if (error.name !== 'NotFoundError') {
                throw error;
            }
        }

        selectedTemplateFile = null;
        templateImageDialog.close();
        await loadTemplateFiles();
        setPageStatus(`Template "${deletedName}" excluído.`, 'success');
    } catch (error) {
        setPageStatus(error.message || 'Não foi possível excluir o template.', 'error');
    } finally {
        templateImageDeleteButton.disabled = false;
    }
}

function goToTemplateEdit() {
    if (!selectedTemplateFile) {
        return;
    }

    window.location.href = `templates_edit.html?image=${encodeURIComponent(selectedTemplateFile.name)}`;
}

templatesGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-template-name]');
    if (button) {
        openTemplateImageDialog(button.dataset.templateName);
    }
});

templateImageDialogCloseButton.addEventListener('click', () => templateImageDialog.close());
templateImageDeleteButton.addEventListener('click', deleteTemplateImage);
templateImageEditButton.addEventListener('click', goToTemplateEdit);

loadTemplateFiles();

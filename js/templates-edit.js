const templateTitle = document.querySelector('[data-template-title]');
const templateImage = document.querySelector('[data-template-image]');
const templateEmptyState = document.querySelector('[data-template-empty]');
const pageStatus = document.querySelector('[data-page-status]');

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

function showTemplateImage(url, name) {
    templateImage.src = url;
    templateImage.alt = name;
    templateImage.hidden = false;
    templateEmptyState.hidden = true;
    templateTitle.textContent = name;
    document.title = `Studio | ${name}`;
}

async function loadTemplateImage() {
    const imageName = new URLSearchParams(window.location.search).get('image');
    if (!imageName) {
        return;
    }

    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
        }

        const assetsHandle = await rootHandle.getDirectoryHandle('_assets');
        const templatesHandle = await assetsHandle.getDirectoryHandle('templates');
        const fileHandle = await templatesHandle.getFileHandle(imageName);
        const file = await fileHandle.getFile();

        showTemplateImage(URL.createObjectURL(file), imageName);
    } catch (error) {
        setPageStatus(error.message || `Não foi possível carregar o template "${imageName}".`, 'error');
    }
}

loadTemplateImage();

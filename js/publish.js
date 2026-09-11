const publishStatus = document.querySelector('[data-publish-status]');
const publishType = document.querySelector('[data-publish-type]');
const publishPath = document.querySelector('[data-publish-path]');
const publishTitle = document.querySelector('[data-publish-title]');
const publishLists = Object.fromEntries([...document.querySelectorAll('[data-publish-list]')]
    .map(element => [element.dataset.publishList, element]));
const publishCounts = Object.fromEntries([...document.querySelectorAll('[data-publish-count]')]
    .map(element => [element.dataset.publishCount, element]));
const historyBackButton = document.querySelector('[data-history-back]');

const publishDirectories = {
    images: { extension: '.png', icon: 'ri-image-line', label: 'imagem' },
    posts: { extension: '.md', icon: 'ri-file-text-line', label: 'post' },
    campaigns: { extension: '.md', icon: 'ri-file-text-line', label: 'campanha' }
};

historyBackButton.addEventListener('click', event => {
    if (window.history.length > 1) {
        event.preventDefault();
        window.history.back();
    }
});

function setPublishStatus(message, type = '') {
    publishStatus.querySelector('.folder-status-message').textContent = message;
    publishStatus.dataset.type = type;
    publishStatus.dataset.visible = String(Boolean(message));
    publishStatus.setAttribute('aria-hidden', String(!message));
    publishStatus.querySelector('.folder-status-icon').className = type === 'error'
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

function getContentTitle(markdown) {
    const titleMatch = markdown.match(/^title\s*:\s*(.+)$/im);
    return titleMatch ? titleMatch[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

function renderFiles(directory, files) {
    const list = publishLists[directory];
    const count = publishCounts[directory];
    const { icon, label } = publishDirectories[directory];
    list.replaceChildren();
    count.textContent = `${files.length}`;

    if (files.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'publish-empty-state';
        empty.textContent = `Nenhum ${label} encontrado.`;
        list.append(empty);
        return;
    }

    for (const file of files) {
        const item = document.createElement('div');
        item.className = directory === 'images' ? 'publish-image-file' : 'publish-file';
        if (directory === 'images') {
            const image = document.createElement('img');
            const imageUrl = URL.createObjectURL(file.file);
            image.src = imageUrl;
            image.alt = file.name;
            image.title = file.name;
            image.addEventListener('load', () => URL.revokeObjectURL(imageUrl), { once: true });
            item.append(image);
            list.append(item);
            continue;
        }

        const fileIcon = document.createElement('i');
        fileIcon.className = icon;
        fileIcon.setAttribute('aria-hidden', 'true');
        const fileName = document.createElement('span');
        fileName.textContent = file.name;
        item.append(fileIcon, fileName);
        list.append(item);
    }
}

async function getDirectoryFiles(contentHandle, directory) {
    const { extension } = publishDirectories[directory];

    try {
        const directoryHandle = await contentHandle.getDirectoryHandle(directory);
        const files = [];
        for await (const [name, handle] of directoryHandle.entries()) {
            if (handle.kind === 'file' && name.toLocaleLowerCase().endsWith(extension)) {
                files.push({ name, file: directory === 'images' ? await handle.getFile() : null });
            }
        }
        return files.sort((first, second) => first.name.localeCompare(second.name));
    } catch (error) {
        if (error.name === 'NotFoundError') {
            return [];
        }
        throw error;
    }
}

async function loadPublishContent() {
    try {
        const { type, content } = getContentLocation();
        const rootHandle = await getSavedFolderHandle();

        if (!rootHandle) {
            throw new Error('Abra uma pasta no Studio antes de acessar a publicação.');
        }

        const permission = await rootHandle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
            throw new Error('Abra novamente a pasta no Studio para conceder acesso.');
        }

        const typeHandle = await rootHandle.getDirectoryHandle(type);
        const contentHandle = await typeHandle.getDirectoryHandle(content);
        const indexFileHandle = await contentHandle.getFileHandle('index.md');
        const indexFile = await indexFileHandle.getFile();
        const entries = await Promise.all(Object.keys(publishDirectories)
            .map(async directory => [directory, await getDirectoryFiles(contentHandle, directory)]));

        for (const [directory, files] of entries) {
            renderFiles(directory, files);
        }

        const contentPath = `${type}/${content}/index.md`;
        const contentTitle = getContentTitle(await indexFile.text()) || content;
        publishType.textContent = type;
        publishPath.textContent = contentPath;
        publishTitle.textContent = contentTitle;
        document.title = `Studio | ${contentTitle}`;
    } catch (error) {
        for (const directory of Object.keys(publishDirectories)) {
            renderFiles(directory, []);
        }
        const message = error.name === 'NotFoundError'
            ? 'O conteúdo solicitado não foi encontrado.'
            : error.message || 'Não foi possível carregar o conteúdo.';
        setPublishStatus(message, 'error');
    }
}

loadPublishContent();
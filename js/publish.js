const publishStatus = document.querySelector('[data-publish-status]');
const publishType = document.querySelector('[data-publish-type]');
const publishPath = document.querySelector('[data-publish-path]');
const publishTitle = document.querySelector('[data-publish-title]');
const publishLists = Object.fromEntries([...document.querySelectorAll('[data-publish-list]')]
    .map(element => [element.dataset.publishList, element]));
const publishCounts = Object.fromEntries([...document.querySelectorAll('[data-publish-count]')]
    .map(element => [element.dataset.publishCount, element]));
const historyBackButton = document.querySelector('[data-history-back]');
const newImageLink = document.querySelector('[data-new-image-link]');
const uploadImageButton = document.querySelector('[data-upload-image-button]');
const uploadImageInput = document.querySelector('[data-upload-image-input]');
const newPostButton = document.querySelector('[data-new-post-button]');
const newCampaignButton = document.querySelector('[data-new-campaign-button]');
const campaignDialog = document.querySelector('[data-campaign-dialog]');
const campaignDialogTitle = document.querySelector('[data-campaign-dialog-title]');
const campaignDialogCloseButton = document.querySelector('[data-campaign-dialog-close]');
const campaignTitleInput = document.querySelector('[data-campaign-title]');
const campaignSubtitleInput = document.querySelector('[data-campaign-subtitle]');
const campaignPublishedAtInput = document.querySelector('[data-campaign-published-at]');
const campaignContentEditor = document.querySelector('[data-campaign-content]');
const campaignSaveButton = document.querySelector('[data-campaign-save]');
const campaignDeleteButton = document.querySelector('[data-campaign-delete]');
const postDialog = document.querySelector('[data-post-dialog]');
const postDialogTitle = document.querySelector('[data-post-dialog-title]');
const postDialogCloseButton = document.querySelector('[data-post-dialog-close]');
const postNetworkSelect = document.querySelector('[data-post-network]');
const postPublishedAtInput = document.querySelector('[data-post-published-at]');
const postMessageEditor = document.querySelector('[data-post-message]');
const postSaveButton = document.querySelector('[data-post-save]');
const postDeleteButton = document.querySelector('[data-post-delete]');
const publishImageDialog = document.querySelector('[data-publish-image-dialog]');
const publishImageDialogTitle = document.querySelector('[data-publish-image-dialog-title]');
const publishImageDialogPreview = document.querySelector('[data-publish-image-dialog-preview]');
const publishImageDialogCloseButton = document.querySelector('[data-publish-image-dialog-close]');
const publishImageDeleteButton = document.querySelector('[data-publish-image-delete]');

const publishDirectories = {
    images: {
        extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'],
        extension: '.png',
        icon: 'ri-image-line',
        label: 'imagem'
    },
    posts: { extension: '.md', icon: 'ri-file-text-line', label: 'post' },
    campaigns: { extension: '.md', icon: 'ri-mail-line', label: 'campanha' }
};

let currentContentHandle = null;
let selectedImage = null;
let selectedImageUrl = null;
let selectedPost = null;
let selectedCampaign = null;

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

function getPostIcon(title) {
    const icons = {
        discord: 'ri-discord-line',
        instagram: 'ri-instagram-line',
        linkedin: 'ri-linkedin-box-line',
        whatsapp: 'ri-whatsapp-line',
        youtube: 'ri-youtube-line'
    };

    return icons[slugifyNetworkName(title)] || publishDirectories.posts.icon;
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
            image.addEventListener('click', () => openPublishImageDialog(file));
            item.append(image);
            list.append(item);
            continue;
        }

        const fileIcon = document.createElement('i');
        fileIcon.className = directory === 'posts' ? getPostIcon(file.title) : icon;
        fileIcon.setAttribute('aria-hidden', 'true');
        if (directory === 'campaigns') {
            const fileInfo = document.createElement('div');
            fileInfo.className = 'publish-file-info';
            const titleLine = document.createElement('span');
            titleLine.className = 'publish-file-title';
            titleLine.textContent = file.title || file.name;
            const subtitleLine = document.createElement('span');
            subtitleLine.className = 'publish-file-subtitle';
            subtitleLine.textContent = file.subtitle;
            const dateLine = document.createElement('span');
            dateLine.className = 'publish-file-date';
            dateLine.textContent = file.publishedAtUtc;
            fileInfo.append(titleLine, subtitleLine, dateLine);
            item.append(fileIcon, fileInfo);
        } else {
            const fileLabel = document.createElement('span');
            fileLabel.textContent = directory === 'posts' ? file.title || file.name : file.name;
            item.append(fileIcon, fileLabel);
        }
        if (directory === 'posts') {
            item.addEventListener('click', () => openEditPostDialog(file));
        }
        if (directory === 'campaigns') {
            item.addEventListener('click', () => openEditCampaignDialog(file));
        }
        list.append(item);
    }
}

async function getDirectoryFiles(contentHandle, directory) {
    const config = publishDirectories[directory];
    const extensions = config.extensions || [config.extension];

    try {
        const directoryHandle = await contentHandle.getDirectoryHandle(directory);
        const files = [];
        for await (const [name, handle] of directoryHandle.entries()) {
            const lowerName = name.toLocaleLowerCase();
            if (handle.kind === 'file' && extensions.some(ext => lowerName.endsWith(ext))) {
                const file = directory === 'images' ? await handle.getFile() : null;
                let title = '';
                let subtitle = '';
                let publishedAtUtc = '';
                if (directory === 'posts') {
                    title = getContentTitle(await (await handle.getFile()).text());
                } else if (directory === 'campaigns') {
                    ({ title, subtitle, publishedAtUtc } = parseCampaignMarkdown(await (await handle.getFile()).text()));
                }
                files.push({ name, handle, file, title, subtitle, publishedAtUtc });
            }
        }
        return directory === 'campaigns'
            ? files.sort((first, second) => first.publishedAtUtc.localeCompare(second.publishedAtUtc))
            : files.sort((first, second) => first.name.localeCompare(second.name));
    } catch (error) {
        if (error.name === 'NotFoundError') {
            return [];
        }
        throw error;
    }
}

function openPublishImageDialog(file) {
    if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
    }

    selectedImage = file;
    selectedImageUrl = URL.createObjectURL(file.file);
    publishImageDialogTitle.textContent = file.name;
    publishImageDialogPreview.src = selectedImageUrl;
    publishImageDialogPreview.alt = file.name;
    publishImageDialog.showModal();
}

async function reloadPublishImages() {
    const files = await getDirectoryFiles(currentContentHandle, 'images');
    renderFiles('images', files);
}

async function reloadPublishPosts() {
    const files = await getDirectoryFiles(currentContentHandle, 'posts');
    renderFiles('posts', files);
}

async function reloadPublishCampaigns() {
    const files = await getDirectoryFiles(currentContentHandle, 'campaigns');
    renderFiles('campaigns', files);
}

async function deletePublishImage() {
    if (!selectedImage || !currentContentHandle
        || !window.confirm(`Excluir a imagem "${selectedImage.name}"?`)) {
        return;
    }

    publishImageDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir a imagem.');
        }

        const imagesHandle = await currentContentHandle.getDirectoryHandle('images');
        const deletedName = selectedImage.name;
        await imagesHandle.removeEntry(deletedName);
        publishImageDialog.close();
        await reloadPublishImages();
        setPublishStatus(`Imagem "${deletedName}" excluída.`, 'success');
    } catch (error) {
        setPublishStatus(error.message || 'Não foi possível excluir a imagem.', 'error');
    } finally {
        publishImageDeleteButton.disabled = false;
    }
}

async function loadPublishContent() {
    try {
        const { type, content } = getContentLocation();
        const imageParameters = new URLSearchParams({ type, content });
        newImageLink.href = `images.html?${imageParameters}`;
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
        currentContentHandle = contentHandle;
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

function slugifyNetworkName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parsePostMarkdown(markdown) {
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!frontmatterMatch) {
        return { publishedAtUtc: '', content: markdown.trim() };
    }

    const [, frontmatter, body] = frontmatterMatch;
    const publishedAtUtc = frontmatter.match(/^published_at_utc\s*:\s*(.*)$/im)?.[1]?.trim() ?? '';
    return { publishedAtUtc, content: body.replace(/^\n/, '') };
}

function createPostFrontmatter(organizationId, networkName, publishedAtUtc) {
    return `---
organization_id: ${organizationId}
title: ${networkName}
slug: ${slugifyNetworkName(networkName)}
published_at_utc: ${publishedAtUtc}
---
`;
}

async function openEditPostDialog(file) {
    selectedPost = file;
    const fileObj = await file.handle.getFile();
    const { publishedAtUtc, content } = parsePostMarkdown(await fileObj.text());
    const matchedOption = [...postNetworkSelect.options]
        .find(option => `${slugifyNetworkName(option.value)}.md` === file.name);
    postNetworkSelect.value = matchedOption ? matchedOption.value : postNetworkSelect.value;
    postNetworkSelect.disabled = true;
    postPublishedAtInput.value = publishedAtUtc;
    postMessageEditor.value = content;
    postDialogTitle.textContent = 'Editar post';
    postDeleteButton.hidden = false;
    postDialog.showModal();
}

newPostButton.addEventListener('click', () => {
    selectedPost = null;
    postNetworkSelect.disabled = false;
    postNetworkSelect.value = 'Discord';
    postPublishedAtInput.value = '';
    postMessageEditor.value = '';
    postDialogTitle.textContent = 'Novo post';
    postDeleteButton.hidden = true;
    postDialog.showModal();
});

postDialogCloseButton.addEventListener('click', () => postDialog.close());

postSaveButton.addEventListener('click', async () => {
    const publishedAtUtc = postPublishedAtInput.value.trim();
    const message = postMessageEditor.value.trim();
    if (!publishedAtUtc || !message) {
        setPublishStatus('Informe published_at_utc e o texto da mensagem.', 'error');
        return;
    }

    postSaveButton.disabled = true;
    try {
        if (!currentContentHandle) {
            throw new Error('Não foi possível localizar o conteúdo para salvar o post.');
        }

        const organizationId = localStorage.getItem('organization_id');
        if (!organizationId) {
            throw new Error('O organization_id da pasta aberta não foi encontrado.');
        }

        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar o post.');
        }

        const postsHandle = await currentContentHandle.getDirectoryHandle('posts', { create: true });
        const isEditing = Boolean(selectedPost);
        const fileName = isEditing ? selectedPost.name : `${slugifyNetworkName(postNetworkSelect.value)}.md`;
        const fileHandle = isEditing ? selectedPost.handle : await postsHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(`${createPostFrontmatter(organizationId, postNetworkSelect.value, publishedAtUtc)}\n${message}`);
        await writable.close();

        postDialog.close();
        selectedPost = null;
        await reloadPublishPosts();
        setPublishStatus(`Post "${fileName}" ${isEditing ? 'atualizado' : 'salvo'}.`, 'success');
    } catch (error) {
        setPublishStatus(error.message || 'Não foi possível salvar o post.', 'error');
    } finally {
        postSaveButton.disabled = false;
    }
});

postDeleteButton.addEventListener('click', async () => {
    if (!selectedPost || !currentContentHandle
        || !window.confirm(`Excluir o post "${selectedPost.name}"?`)) {
        return;
    }

    postDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir o post.');
        }

        const postsHandle = await currentContentHandle.getDirectoryHandle('posts');
        const deletedName = selectedPost.name;
        await postsHandle.removeEntry(deletedName);
        postDialog.close();
        selectedPost = null;
        await reloadPublishPosts();
        setPublishStatus(`Post "${deletedName}" excluído.`, 'success');
    } catch (error) {
        setPublishStatus(error.message || 'Não foi possível excluir o post.', 'error');
    } finally {
        postDeleteButton.disabled = false;
    }
});

function slugifyCampaignFileName(publishedAtUtc) {
    return `${publishedAtUtc.trim().replace(/[^a-z0-9]+/gi, '')}.md`;
}

function createCampaignFrontmatter(organizationId, title, subtitle, publishedAtUtc) {
    return `---
organization_id: ${organizationId}
title: ${title}
subtitle: ${subtitle}
published_at_utc: ${publishedAtUtc}
---
`;
}

function parseCampaignMarkdown(markdown) {
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!frontmatterMatch) {
        return { title: '', subtitle: '', publishedAtUtc: '', content: markdown.trim() };
    }

    const [, frontmatter, body] = frontmatterMatch;
    const getField = key => frontmatter.match(new RegExp(`^${key}\\s*:\\s*(.*)$`, 'im'))?.[1]?.trim() ?? '';

    return {
        title: getField('title'),
        subtitle: getField('subtitle'),
        publishedAtUtc: getField('published_at_utc'),
        content: body.replace(/^\n/, '')
    };
}

async function openEditCampaignDialog(file) {
    selectedCampaign = file;
    const fileObj = await file.handle.getFile();
    const { title, subtitle, publishedAtUtc, content } = parseCampaignMarkdown(await fileObj.text());
    campaignTitleInput.value = title;
    campaignSubtitleInput.value = subtitle;
    campaignPublishedAtInput.value = publishedAtUtc;
    campaignContentEditor.value = content;
    campaignDialogTitle.textContent = 'Editar campanha';
    campaignDeleteButton.hidden = false;
    campaignDialog.showModal();
}

newCampaignButton.addEventListener('click', () => {
    selectedCampaign = null;
    campaignTitleInput.value = '';
    campaignSubtitleInput.value = '';
    campaignPublishedAtInput.value = '';
    campaignContentEditor.value = '';
    campaignDialogTitle.textContent = 'Nova campanha';
    campaignDeleteButton.hidden = true;
    campaignDialog.showModal();
});

campaignDialogCloseButton.addEventListener('click', () => campaignDialog.close());

campaignSaveButton.addEventListener('click', async () => {
    const title = campaignTitleInput.value.trim();
    const subtitle = campaignSubtitleInput.value.trim();
    const publishedAtUtc = campaignPublishedAtInput.value.trim();
    const content = campaignContentEditor.value;

    if (!title || !subtitle || !publishedAtUtc) {
        setPublishStatus('Informe title, subtitle e published_at_utc.', 'error');
        return;
    }

    campaignSaveButton.disabled = true;
    try {
        if (!currentContentHandle) {
            throw new Error('Não foi possível localizar o conteúdo para salvar a campanha.');
        }

        const organizationId = localStorage.getItem('organization_id');
        if (!organizationId) {
            throw new Error('O organization_id da pasta aberta não foi encontrado.');
        }

        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar a campanha.');
        }

        const campaignsHandle = await currentContentHandle.getDirectoryHandle('campaigns', { create: true });
        const isEditing = Boolean(selectedCampaign);
        const fileName = slugifyCampaignFileName(publishedAtUtc);
        const isRenaming = isEditing && selectedCampaign.name !== fileName;
        const fileHandle = isEditing && !isRenaming
            ? selectedCampaign.handle
            : await campaignsHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(`${createCampaignFrontmatter(organizationId, title, subtitle, publishedAtUtc)}\n${content}`);
        await writable.close();

        if (isRenaming) {
            await campaignsHandle.removeEntry(selectedCampaign.name);
        }

        campaignDialog.close();
        selectedCampaign = null;
        await reloadPublishCampaigns();
        setPublishStatus(`Campanha "${fileName}" ${isEditing ? 'atualizada' : 'salva'}.`, 'success');
    } catch (error) {
        setPublishStatus(error.message || 'Não foi possível salvar a campanha.', 'error');
    } finally {
        campaignSaveButton.disabled = false;
    }
});

campaignDeleteButton.addEventListener('click', async () => {
    if (!selectedCampaign || !currentContentHandle
        || !window.confirm(`Excluir a campanha "${selectedCampaign.name}"?`)) {
        return;
    }

    campaignDeleteButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para excluir a campanha.');
        }

        const campaignsHandle = await currentContentHandle.getDirectoryHandle('campaigns');
        const deletedName = selectedCampaign.name;
        await campaignsHandle.removeEntry(deletedName);
        campaignDialog.close();
        selectedCampaign = null;
        await reloadPublishCampaigns();
        setPublishStatus(`Campanha "${deletedName}" excluída.`, 'success');
    } catch (error) {
        setPublishStatus(error.message || 'Não foi possível excluir a campanha.', 'error');
    } finally {
        campaignDeleteButton.disabled = false;
    }
});

publishImageDialogCloseButton.addEventListener('click', () => publishImageDialog.close());
publishImageDeleteButton.addEventListener('click', deletePublishImage);
publishImageDialog.addEventListener('close', () => {
    if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
        selectedImageUrl = null;
    }
    selectedImage = null;
    publishImageDialogPreview.removeAttribute('src');
});

uploadImageButton?.addEventListener('click', () => {
    uploadImageInput?.click();
});

uploadImageInput?.addEventListener('change', async () => {
    const files = Array.from(uploadImageInput.files || []);
    if (files.length === 0) {
        return;
    }

    uploadImageButton.disabled = true;
    try {
        if (!currentContentHandle) {
            throw new Error('Abra uma pasta no Studio antes de enviar imagens.');
        }

        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para enviar imagens.');
        }

        const imagesHandle = await currentContentHandle.getDirectoryHandle('images', { create: true });
        for (const file of files) {
            const fileHandle = await imagesHandle.getFileHandle(file.name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();
        }

        uploadImageInput.value = '';
        await reloadPublishImages();
        const message = files.length === 1
            ? `Imagem "${files[0].name}" enviada.`
            : `${files.length} imagens enviadas.`;
        setPublishStatus(message, 'success');
    } catch (error) {
        setPublishStatus(error.message || 'Não foi possível enviar as imagens.', 'error');
    } finally {
        uploadImageButton.disabled = false;
        uploadImageInput.value = '';
    }
});
const openFolderButton = document.querySelector('#open-folder-button');
const folderStatus = document.querySelector('#folder-status');
const folderCardList = document.querySelector('#folder-card-list');
const folderSearch = document.querySelector('#folder-search');

const requiredFrontmatter = ['organization_id', 'title', 'slug', 'summary'];
let loadedProjects = [];

function setFolderStatus(message, type = '') {
    folderStatus.querySelector('.folder-status-message').textContent = message;
    folderStatus.dataset.type = type;
    folderStatus.dataset.visible = String(Boolean(message));
    folderStatus.setAttribute('aria-hidden', String(!message));
    folderStatus.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';
}

function parseFrontmatter(markdown, requiredProperties = requiredFrontmatter) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

    if (!frontmatterMatch) {
        throw new Error('O arquivo index.md deve conter um frontmatter válido.');
    }

    const properties = Object.fromEntries(
        frontmatterMatch[1]
            .split(/\r?\n/)
            .filter(line => line.trim())
            .map(line => {
                const separatorIndex = line.indexOf(':');
                if (separatorIndex === -1) {
                    return ['', ''];
                }

                return [
                    line.slice(0, separatorIndex).trim(),
                    line.slice(separatorIndex + 1).trim()
                ];
            })
    );

    const missingProperties = requiredProperties.filter(property => !properties[property]);
    if (missingProperties.length > 0) {
        throw new Error(`Preencha no frontmatter: ${missingProperties.join(', ')}.`);
    }

    return properties;
}

async function getOrganizationId(directoryHandle) {
    const indexFileHandle = await directoryHandle.getFileHandle('index.md');
    const indexFile = await indexFileHandle.getFile();
    const metadata = parseFrontmatter(await indexFile.text(), ['organization_id']);
    return metadata.organization_id;
}

function saveFolderMetadata(directoryHandle, organizationId) {
    localStorage.setItem('organization_id', organizationId);
    localStorage.setItem('last_opened_folder', directoryHandle.name);
}

async function rememberApplicationFolder(directoryHandle) {
    try {
        await directoryHandle.getDirectoryHandle('images');
        await saveApplicationFolderHandle(directoryHandle);
    } catch (error) {
        if (error.name !== 'NotFoundError') {
            throw error;
        }
    }
}

async function validateFolder(directoryHandle) {
    const organizationId = await getOrganizationId(directoryHandle);
    const folders = [];

    for await (const [name, handle] of directoryHandle.entries()) {
        if (handle.kind === 'directory') {
            folders.push({ name, handle });
        }
    }

    if (folders.length === 0) {
        throw new Error('A pasta selecionada não contém subpastas.');
    }

    const projects = [];
    for (const folder of folders.sort((first, second) => first.name.localeCompare(second.name))) {
        try {
            const indexFileHandle = await folder.handle.getFileHandle('index.md');
            const indexFile = await indexFileHandle.getFile();
            const metadata = parseFrontmatter(await indexFile.text());
            projects.push({ ...metadata, folderName: folder.name });
        } catch (error) {
            if (error.name === 'NotFoundError') {
                continue;
            }

            throw new Error(`Não foi possível validar a subpasta "${folder.name}": ${error.message}`);
        }
    }

    return { organizationId, projects };
}

function renderProjects(projects) {
    folderCardList.replaceChildren();

    for (const project of projects) {
        const card = document.createElement('a');
        card.className = 'folder-card';
        card.href = `${project.slug}.html`;
        card.setAttribute('aria-label', `Abrir ${project.title}`);

        const icon = document.createElement('i');
        icon.className = 'ri-markdown-line folder-card-icon';
        icon.setAttribute('aria-hidden', 'true');

        const content = document.createElement('div');
        content.className = 'folder-card-content';

        const folderName = document.createElement('span');
        folderName.className = 'folder-card-folder';
        folderName.textContent = project.folderName;

        const title = document.createElement('h2');
        title.textContent = project.title;

        const summary = document.createElement('p');
        summary.textContent = project.summary;

        const slug = document.createElement('span');
        slug.className = 'folder-card-slug';
        slug.textContent = project.slug;

        content.append(folderName, title, summary, slug);
        card.append(icon, content);
        folderCardList.append(card);
    }
}

function filterProjects() {
    const query = folderSearch.value.trim().toLocaleLowerCase();
    const filteredProjects = loadedProjects.filter(project => [
        project.folderName,
        project.title,
        project.summary,
        project.slug
    ].some(value => value.toLocaleLowerCase().includes(query)));

    renderProjects(filteredProjects);
}

async function restoreLastFolder() {
    try {
        const directoryHandle = await getSavedFolderHandle();
        if (!directoryHandle) {
            return;
        }

        const permission = await directoryHandle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
            setFolderStatus('A última pasta válida está salva. Abra-a novamente para conceder acesso.');
            return;
        }

        const { organizationId, projects } = await validateFolder(directoryHandle);
        await rememberApplicationFolder(directoryHandle);
        saveFolderMetadata(directoryHandle, organizationId);
        loadedProjects = projects;
        filterProjects();
        setFolderStatus(`${projects.length} projeto(s) carregado(s) de "${directoryHandle.name}".`, 'success');
    } catch (error) {
        if (error.name === 'NotFoundError') {
            setFolderStatus('A última pasta salva não contém um index.md válido.', 'error');
        } else {
            folderCardList.replaceChildren();
            setFolderStatus(error.message || 'A última pasta não pôde ser carregada.', 'error');
        }
    }
}

async function openFolder() {
    if (!window.showDirectoryPicker) {
        const message = window.isSecureContext
            ? 'Seu navegador não oferece suporte à abertura de pastas.'
            : 'Abra o Studio por http://localhost (não diretamente pelo arquivo index.html) para abrir pastas.';
        setFolderStatus(message, 'error');
        return;
    }

    openFolderButton.disabled = true;
    setFolderStatus('Validando a pasta...');

    try {
        const directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
        const { organizationId, projects } = await validateFolder(directoryHandle);
        await saveFolderHandle(directoryHandle);
        await rememberApplicationFolder(directoryHandle);
        saveFolderMetadata(directoryHandle, organizationId);
        loadedProjects = projects;
        filterProjects();
        setFolderStatus(`${projects.length} projeto(s) carregado(s) de "${directoryHandle.name}".`, 'success');
    } catch (error) {
        if (error.name === 'AbortError') {
            setFolderStatus('Abertura da pasta cancelada.');
        } else if (error.name === 'NotFoundError') {
            folderCardList.replaceChildren();
            setFolderStatus('Cada subpasta precisa conter um arquivo index.md.', 'error');
        } else {
            folderCardList.replaceChildren();
            setFolderStatus(error.message || 'Não foi possível validar a pasta.', 'error');
        }
    } finally {
        openFolderButton.disabled = false;
    }
}

if (openFolderButton) {
    restoreLastFolder();
    openFolderButton.addEventListener('click', openFolder);
    folderSearch.addEventListener('input', filterProjects);
}
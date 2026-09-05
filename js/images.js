const backLink = document.querySelector('[data-back-link]');
const frontmatterPanel = document.querySelector('[data-frontmatter-panel]');
const saveFrontmatterButton = document.querySelector('[data-save-frontmatter]');
const exportImageButton = document.querySelector('[data-export-image]');
const pageStatus = document.querySelector('[data-page-status]');
const imageCanvas = document.querySelector('[data-image-canvas]');
const imageCanvasEmpty = document.querySelector('[data-image-canvas-empty]');
const templateNodes = [...document.querySelectorAll('[data-template-node]')];
const queryParameters = new URLSearchParams(location.search);
const type = queryParameters.get('type');
const content = queryParameters.get('content');
const imageTemplateNames = ['post.png', 'share.png', 'square.png', 'story.png'];
let selectedItem = null;
let selectedTemplate = null;
let selectedImage = null;
let templateDirectoryHandle = null;
let saveToContentButton = null;
let imageRenderVersion = 0;
let pageStatusTimer = null;
const numericTemplateProperties = new Set(['width', 'height', 'top', 'left', 'font-size', 'font-weight']);

if (backLink && document.referrer) {
    try {
        const originUrl = new URL(document.referrer);
        if (originUrl.origin === window.location.origin) {
            backLink.href = `${originUrl.pathname}${originUrl.search}${originUrl.hash}`;
        }
    } catch {
    }
}

function setPageStatus(message, type = '') {
    clearTimeout(pageStatusTimer);
    pageStatus.querySelector('.folder-status-message').textContent = message;
    pageStatus.dataset.type = type;
    pageStatus.dataset.visible = String(Boolean(message));
    pageStatus.setAttribute('aria-hidden', String(!message));
    pageStatus.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';

    if (message) {
        pageStatusTimer = setTimeout(() => {
            pageStatus.dataset.visible = 'false';
            pageStatus.setAttribute('aria-hidden', 'true');
        }, 4000);
    }
}

function parseFrontmatter(markdown) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        throw new Error('O arquivo index.md deve conter um frontmatter válido.');
    }

    const entries = frontmatterMatch[1].split(/\r?\n/).reduce((metadata, line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) {
            return metadata;
        }

        metadata.push({
            key: line.slice(0, separatorIndex).trim(),
            value: line.slice(separatorIndex + 1).trim()
        });
        return metadata;
    }, []);

    return { entries, body: markdown.slice(frontmatterMatch[0].length) };
}

function renderFrontmatterEditor(frontmatter) {
    const descriptionEntry = frontmatter.entries.find(entry => entry.key === 'description')
        || frontmatter.entries.find(entry => entry.key === 'summary');
    const editableEntries = frontmatter.entries.filter(entry => entry.key === 'title' || entry === descriptionEntry);

    if (!editableEntries.some(entry => entry.key === 'title') || !descriptionEntry) {
        throw new Error('O frontmatter deve conter title e description (ou summary).');
    }

    frontmatterPanel.replaceChildren();
    const form = document.createElement('form');
    form.className = 'frontmatter-form';
    form.addEventListener('submit', event => event.preventDefault());

    for (const entry of editableEntries) {
        const label = document.createElement('label');
        label.className = 'frontmatter-field';

        const name = document.createElement('span');
        name.textContent = entry.key === 'summary' ? 'description' : entry.key;

        const input = entry.key === descriptionEntry.key ? document.createElement('textarea') : document.createElement('input');
        input.name = entry.key;
        input.dataset.frontmatterKey = entry.key;
        input.value = entry.value;
        if (entry.key === descriptionEntry.key) {
            input.rows = 5;
        }

        label.append(name, input);
        form.append(label);
    }

    frontmatterPanel.append(form);

    const separator = document.createElement('hr');
    separator.className = 'templates-separator';
    const templatesTitle = document.createElement('strong');
    templatesTitle.textContent = 'Templates';
    templatesTitle.className = 'templates-title';

    const imagesList = document.createElement('div');
    imagesList.className = 'image-grid';
    imagesList.dataset.imagesList = '';
    imagesList.setAttribute('aria-label', 'Imagens do item');

    saveToContentButton = document.createElement('button');
    saveToContentButton.className = 'save-article-button save-images-button';
    saveToContentButton.type = 'button';
    saveToContentButton.disabled = true;
    saveToContentButton.innerHTML = '<i class="ri-save-line" aria-hidden="true"></i><span>SAVE TO CONTENT</span>';
    saveToContentButton.addEventListener('click', saveImagesToContent);

    frontmatterPanel.append(separator, templatesTitle, imagesList, saveToContentButton);
    saveFrontmatterButton.disabled = false;
}

function renderImageTemplates(files) {
    const imagesList = frontmatterPanel.querySelector('[data-images-list]');
    if (!imagesList) {
        return;
    }

    imagesList.replaceChildren();

    if (!files.length) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'image-grid-empty empty-editor-state';
        emptyMessage.textContent = 'Nenhuma imagem encontrada.';
        imagesList.append(emptyMessage);
        return;
    }

    for (const { name, url } of files) {
        const item = document.createElement('figure');
        item.className = 'image-grid-item';
        item.dataset.templateName = name;

        const image = document.createElement('img');
        image.src = url;
        image.alt = name;
        image.loading = 'lazy';

        const caption = document.createElement('figcaption');
        caption.textContent = name;

        const button = document.createElement('button');
        button.className = 'image-template-button';
        button.type = 'button';
        button.setAttribute('aria-label', `Editar ${name}`);
        button.append(image, caption);
        button.addEventListener('click', () => selectTemplate(name, item));

        item.append(button);
        imagesList.append(item);
    }

    saveToContentButton.disabled = false;
}

function getFrontmatterValue(key) {
    const field = frontmatterPanel.querySelector(`[data-frontmatter-key="${key}"]`);
    if (field) {
        return field.value;
    }

    return selectedItem?.frontmatter.entries.find(entry => entry.key === key)?.value || '';
}

function drawTextNode(context, text, node) {
    if (!text || !node) {
        return;
    }

    const fontFamily = String(node['font-family'] || 'sans-serif').replaceAll('"', '\\"');
    const fontStyle = node['font-style'] || 'normal';
    const fontWeight = node['font-weight'] || 'normal';
    const fontSize = Number(node['font-size']) || 16;
    const lineHeight = fontSize * 1.2;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';

    context.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}"`;
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > node.width) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) {
        lines.push(line);
    }

    context.save();
    context.beginPath();
    context.rect(node.left, node.top, node.width, node.height);
    context.clip();
    context.fillStyle = node.color || '#000000';
    context.textBaseline = 'top';
    lines.forEach((lineText, index) => {
        context.fillText(lineText, node.left, node.top + index * lineHeight);
    });
    context.restore();
}

function drawSelectedCanvas(template) {
    if (!selectedImage) {
        return;
    }

    imageCanvas.width = selectedImage.naturalWidth;
    imageCanvas.height = selectedImage.naturalHeight;
    const context = imageCanvas.getContext('2d');
    context.drawImage(selectedImage, 0, 0);
    drawTextNode(context, getFrontmatterValue('title'), template.title);
    drawTextNode(
        context,
        getFrontmatterValue('description') || getFrontmatterValue('summary'),
        template.summary
    );
    imageCanvas.hidden = false;
    imageCanvasEmpty.hidden = true;
    exportImageButton.disabled = false;
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image), { once: true });
        image.addEventListener('error', () => reject(new Error('Não foi possível carregar a imagem.')), { once: true });
        image.src = url;
    });
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

async function saveImagesToContent() {
    if (!selectedItem || !templateDirectoryHandle || !saveToContentButton) {
        return;
    }

    saveToContentButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar as imagens.');
        }

        const imagesHandle = await selectedItem.contentHandle.getDirectoryHandle('images', { create: true });
        for (const templateImageName of imageTemplateNames) {
            const templateName = templateImageName.replace(/\.png$/i, '');
            const imageFileHandle = await templateDirectoryHandle.getFileHandle(templateImageName);
            const templateFileHandle = await templateDirectoryHandle.getFileHandle(`${templateName}.json`);
            const imageFile = await imageFileHandle.getFile();
            const templateFile = await templateFileHandle.getFile();
            const template = JSON.parse(await templateFile.text());
            const imageUrl = URL.createObjectURL(imageFile);

            try {
                const image = await loadImage(imageUrl);
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                drawTextNode(context, getFrontmatterValue('title'), template.title);
                drawTextNode(
                    context,
                    getFrontmatterValue('description') || getFrontmatterValue('summary'),
                    template.summary
                );

                const blob = await canvasToBlob(canvas);
                const outputFileHandle = await imagesHandle.getFileHandle(`${content}_${templateName}.png`, { create: true });
                const writable = await outputFileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            } finally {
                URL.revokeObjectURL(imageUrl);
            }
        }

        setPageStatus('Imagens salvas no conteúdo.', 'success');
    } catch (error) {
        setPageStatus(error.message || 'Não foi possível salvar as imagens no conteúdo.', 'error');
    } finally {
        saveToContentButton.disabled = false;
    }
}

function renderSelectedImage(name, template, imageUrl) {
    const renderVersion = ++imageRenderVersion;
    imageCanvas.hidden = true;
    imageCanvasEmpty.textContent = 'Carregando imagem...';
    imageCanvasEmpty.hidden = false;
    const image = new Image();
    image.addEventListener('load', () => {
        if (renderVersion !== imageRenderVersion) {
            return;
        }

        selectedImage = image;
        drawSelectedCanvas(getEditedTemplate() || template);
    }, { once: true });
    image.addEventListener('error', () => {
        if (renderVersion !== imageRenderVersion) {
            return;
        }

        imageCanvas.hidden = true;
        imageCanvasEmpty.textContent = 'Não foi possível carregar a imagem.';
        imageCanvasEmpty.hidden = false;
    }, { once: true });
    image.src = imageUrl;
}

function getEditedTemplate() {
    if (!selectedTemplate) {
        return null;
    }

    const template = structuredClone(selectedTemplate.data);
    document.querySelectorAll('[data-template-property]').forEach(input => {
        const node = template[input.dataset.templateNode];
        node[input.dataset.templateProperty] = numericTemplateProperties.has(input.dataset.templateProperty)
            ? Number(input.value)
            : input.value;
    });
    return template;
}

function renderEditedTemplate() {
    const template = getEditedTemplate();
    if (template) {
        drawSelectedCanvas(template);
    }
}

function renderTemplateEditor(template) {
    for (const nodeSection of templateNodes) {
        const node = template[nodeSection.dataset.templateNode];
        nodeSection.replaceChildren();

        if (!node) {
            continue;
        }

        const heading = document.createElement('strong');
        heading.textContent = nodeSection.dataset.templateNode;
        nodeSection.append(heading);

        const form = document.createElement('form');
        form.className = 'frontmatter-form template-form';
        form.addEventListener('submit', event => event.preventDefault());

        const propertyGroups = [
            ['width', 'height'],
            ['left', 'top'],
            ['font-size', 'font-weight']
        ];
        const groupedProperties = new Set(propertyGroups.flat());
        const fields = [
            ...propertyGroups,
            ...Object.keys(node)
                .filter(property => !groupedProperties.has(property))
                .map(property => [property])
        ];

        for (const properties of fields) {
            const row = document.createElement('div');
            row.className = properties.length > 1 ? 'template-field-row' : 'template-field-row is-single';

            for (const property of properties) {
                const value = node[property];
                const label = document.createElement('label');
                label.className = 'frontmatter-field';

                const name = document.createElement('span');
                name.textContent = property;

                const input = document.createElement('input');
                input.name = property;
                input.dataset.templateNode = nodeSection.dataset.templateNode;
                input.dataset.templateProperty = property;
                input.value = value;
                input.type = numericTemplateProperties.has(property) ? 'number' : 'text';
                if (numericTemplateProperties.has(property)) {
                    input.step = 'any';
                }
                input.addEventListener('blur', renderEditedTemplate);

                label.append(name, input);
                row.append(label);
            }

            form.append(row);
        }

        nodeSection.append(form);

    }
}

async function selectTemplate(name, item) {
    try {
        const templateFileName = name.replace(/\.png$/i, '.json');
        const templateFileHandle = await templateDirectoryHandle.getFileHandle(templateFileName);
        const templateFile = await templateFileHandle.getFile();
        const template = JSON.parse(await templateFile.text());
        const imageUrl = item.querySelector('img').src;
        selectedTemplate = { name, data: template, imageUrl };

        if (!template.title || !template.summary) {
            throw new Error('O template deve conter os nós title e summary.');
        }

        document.querySelectorAll('[data-template-name]').forEach(templateItem => {
            templateItem.classList.toggle('is-selected', templateItem === item);
        });
        renderSelectedImage(name, template, imageUrl);
        renderTemplateEditor(template);
    } catch (error) {
        setPageStatus(error.message || 'Não foi possível carregar o template.', 'error');
    }
}

async function loadImageTemplates() {
    const rootHandle = await getSavedFolderHandle();
    const assetsHandle = await rootHandle.getDirectoryHandle('_assets');
    templateDirectoryHandle = await assetsHandle.getDirectoryHandle('templates');
    const templates = [];

    for (const name of imageTemplateNames) {
        const fileHandle = await templateDirectoryHandle.getFileHandle(name);
        const file = await fileHandle.getFile();
        templates.push({ name, url: URL.createObjectURL(file) });
    }

    renderImageTemplates(templates);
}

async function loadItem() {
    if (!type || !content) {
        throw new Error('Informe os parâmetros type e content na URL.');
    }

    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
    }

    const typeHandle = await rootHandle.getDirectoryHandle(type);
    const contentHandle = await typeHandle.getDirectoryHandle(content);
    const indexFileHandle = await contentHandle.getFileHandle('index.md');
    const indexFile = await indexFileHandle.getFile();
    const markdown = await indexFile.text();
    const frontmatter = parseFrontmatter(markdown);

    selectedItem = { contentHandle, indexFileHandle, markdown, frontmatter };
    renderFrontmatterEditor(frontmatter);
    await loadImageTemplates();
}

async function saveFrontmatter() {
    if (!selectedItem) {
        return;
    }

    saveFrontmatterButton.disabled = true;
    try {
        const rootHandle = await getSavedFolderHandle();
        const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            throw new Error('Conceda acesso de escrita à pasta para salvar as informações.');
        }

        const values = new Map([...frontmatterPanel.querySelectorAll('[data-frontmatter-key]')]
            .map(field => [field.dataset.frontmatterKey, field.value]));
        const frontmatterText = selectedItem.frontmatter.entries
            .map(entry => `${entry.key}: ${values.get(entry.key) ?? entry.value}`)
            .join('\n');
        const markdown = `---\n${frontmatterText}\n---\n${selectedItem.frontmatter.body}`;
        const writable = await selectedItem.indexFileHandle.createWritable();
        await writable.write(markdown);
        await writable.close();
        selectedItem.markdown = markdown;
        selectedItem.frontmatter = parseFrontmatter(markdown);
        setPageStatus('Informações salvas.', 'success');
    } catch (error) {
        setPageStatus(error.message || 'Não foi possível salvar as informações.', 'error');
    } finally {
        saveFrontmatterButton.disabled = false;
    }
}

async function saveTemplate() {
    if (!selectedTemplate) {
        return;
    }

    const template = structuredClone(selectedTemplate.data);
    document.querySelectorAll('[data-template-property]').forEach(input => {
        const node = template[input.dataset.templateNode];
        node[input.dataset.templateProperty] = numericTemplateProperties.has(input.dataset.templateProperty)
            ? Number(input.value)
            : input.value;
    });

    const rootHandle = await getSavedFolderHandle();
    if (!rootHandle) {
        throw new Error('Nenhuma pasta aberta. Volte ao Studio e abra uma pasta.');
    }

    const permission = await rootHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        throw new Error('Conceda acesso de escrita à pasta para salvar o template.');
    }

    const templateFileName = selectedTemplate.name.replace(/\.png$/i, '.json');
    const assetsHandle = await rootHandle.getDirectoryHandle('_assets');
    const templatesHandle = await assetsHandle.getDirectoryHandle('templates');
    const fileHandle = await templatesHandle.getFileHandle(templateFileName);

    try {
        const writable = await fileHandle.createWritable();
        await writable.write(`${JSON.stringify(template, null, 4)}\n`);
        await writable.close();
    } catch (error) {
        throw new Error(`Não foi possível sobrescrever ${rootHandle.name}\\_assets\\templates\\${templateFileName}: ${error.message}`);
    }
    selectedTemplate.data = template;
}

async function saveAll() {
    saveFrontmatterButton.disabled = true;
    try {
        await saveFrontmatter();
        await saveTemplate();
        setPageStatus('Informações do item e template salvas.', 'success');
    } catch (error) {
        setPageStatus(error.message || 'Não foi possível salvar as informações.', 'error');
    } finally {
        saveFrontmatterButton.disabled = false;
    }
}

function exportImage() {
    if (!selectedTemplate || imageCanvas.hidden) {
        return;
    }

    imageCanvas.toBlob(blob => {
        if (!blob) {
            setPageStatus('Não foi possível exportar a imagem.', 'error');
            return;
        }

        const link = document.createElement('a');
        const templateName = selectedTemplate.name.replace(/\.png$/i, '');
        link.download = `${content}_${templateName}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }, 'image/png');
}

saveFrontmatterButton.addEventListener('click', saveAll);
exportImageButton.addEventListener('click', exportImage);
loadItem().catch(error => setPageStatus(error.message || 'Não foi possível carregar o item.', 'error'));
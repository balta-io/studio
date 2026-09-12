const articleCardList = document.querySelector('[data-article-card-list]');
const articlesStatus = document.querySelector('[data-articles-status]');
const articlesCount = document.querySelector('[data-articles-count]');
const articleSearch = document.querySelector('#article-search');
const articleSort = document.querySelector('#article-sort');
const articleStatusAll = document.querySelector('[data-article-status-all]');
const articleStatusOptions = document.querySelector('[data-article-status-options]');
let loadedArticles = [];

const normalizeFrontmatterValue = (value = '') => value.trim().replace(/^['"]|['"]$/g, '');

function parseArticleFrontmatter(markdown) {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        throw new Error('O arquivo index.md deve conter um frontmatter válido.');
    }

    return Object.fromEntries(
        frontmatterMatch[1]
            .split(/\r?\n/)
            .filter(line => line.trim())
            .map(line => {
                const separatorIndex = line.indexOf(':');
                return separatorIndex === -1
                    ? ['', '']
                    : [line.slice(0, separatorIndex).trim(), normalizeFrontmatterValue(line.slice(separatorIndex + 1))];
            })
    );
}

function setArticlesStatus(message, type = '') {
    clearTimeout(setArticlesStatus.hideTimer);
    articlesStatus.querySelector('.folder-status-message').textContent = message;
    articlesStatus.dataset.type = type;
    articlesStatus.dataset.visible = String(Boolean(message));
    articlesStatus.setAttribute('aria-hidden', String(!message));
    articlesStatus.querySelector('.folder-status-icon').className = type === 'error'
        ? 'ri-error-warning-line folder-status-icon'
        : type === 'success'
            ? 'ri-checkbox-circle-line folder-status-icon'
            : 'ri-information-line folder-status-icon';

    if (message) {
        setArticlesStatus.hideTimer = setTimeout(() => {
            articlesStatus.dataset.visible = 'false';
            articlesStatus.setAttribute('aria-hidden', 'true');
        }, 4000);
    }
}

function getArticleStatusClass(status) {
    const normalizedStatus = normalizeFrontmatterValue(status).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return normalizedStatus || 'unknown';
}

function formatPublishedDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Data não informada';
    }

    const datePart = [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()]
        .map(part => String(part).padStart(2, '0'))
        .join('/');
    const timePart = [date.getUTCHours(), date.getUTCMinutes()]
        .map(part => String(part).padStart(2, '0'))
        .join(':');

    return `${datePart} às ${timePart}`;
}

function createArticleMeta(article) {
    const meta = document.createElement('div');
    meta.className = 'article-card-meta';

    const status = document.createElement('span');
    status.className = `article-card-status article-card-status-${getArticleStatusClass(article.status)}`;
    status.textContent = article.status || 'unknown';

    const publishedAt = document.createElement('time');
    publishedAt.dateTime = article.published_at_utc || '';
    publishedAt.textContent = formatPublishedDate(article.published_at_utc);

    meta.append(status, publishedAt);
    return meta;
}

function getArticleSearchValue(article) {
    return [article.title, article.summary, article.slug]
        .map(value => normalizeFrontmatterValue(value).toLocaleLowerCase())
        .join(' ');
}

function compareArticleTitles(first, second) {
    return (first.title || first.folderName).localeCompare(second.title || second.folderName, 'pt-BR', {
        sensitivity: 'base'
    });
}

function compareArticlePublishedDates(first, second, direction) {
    const firstTime = Date.parse(first.published_at_utc || '');
    const secondTime = Date.parse(second.published_at_utc || '');
    const firstValid = Number.isFinite(firstTime);
    const secondValid = Number.isFinite(secondTime);

    if (!firstValid || !secondValid) {
        return firstValid === secondValid ? compareArticleTitles(first, second) : firstValid ? -1 : 1;
    }

    const difference = firstTime - secondTime;
    return difference === 0 ? compareArticleTitles(first, second) : difference * direction;
}

function getSelectedArticleStatuses() {
    return new Set(Array.from(articleStatusOptions.querySelectorAll('input:checked')).map(input => input.value));
}

function filterAndSortArticles() {
    const query = articleSearch.value.trim().toLocaleLowerCase();
    const selectedStatuses = getSelectedArticleStatuses();
    const sortValue = articleSort.value;
    const filteredArticles = loadedArticles
        .filter(article => !query || getArticleSearchValue(article).includes(query))
        .filter(article => articleStatusAll.checked || selectedStatuses.has(article.status));

    filteredArticles.sort((first, second) => {
        if (sortValue === 'published-asc') {
            return compareArticlePublishedDates(first, second, 1);
        }
        if (sortValue === 'published-desc') {
            return compareArticlePublishedDates(first, second, -1);
        }
        return compareArticleTitles(first, second);
    });

    renderArticles(filteredArticles);
}

function renderArticleStatusFilters(articles) {
    articleStatusOptions.replaceChildren();
    const statuses = [...new Set(articles.map(article => article.status).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second, 'pt-BR', { sensitivity: 'base' }));

    for (const status of statuses) {
        const label = document.createElement('label');
        label.className = 'article-status-option';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = status;
        input.addEventListener('change', () => {
            const checkedStatuses = articleStatusOptions.querySelectorAll('input:checked');
            if (!checkedStatuses.length) {
                articleStatusAll.checked = true;
            } else {
                articleStatusAll.checked = false;
            }
            filterAndSortArticles();
        });

        const text = document.createElement('span');
        text.textContent = status;
        label.append(input, text);
        articleStatusOptions.append(label);
    }
}

function renderArticles(articles) {
    articleCardList.replaceChildren();
    articlesCount.textContent = `${articles.length} ${articles.length === 1 ? 'artigo' : 'artigos'}`;

    if (!articles.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'articles-empty-state';
        emptyState.textContent = 'Nenhum artigo encontrado na pasta articles.';
        articleCardList.append(emptyState);
        return;
    }

    for (const article of articles) {
        const card = document.createElement('div');
        card.className = 'article-card';

        const queryParams = new URLSearchParams({
            type: 'articles',
            content: article.slug || article.folderName
        });

        const image = document.createElement('img');
        image.className = 'article-card-image';
        image.src = 'https://placehold.co/230x160';
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');

        const content = document.createElement('div');
        content.className = 'article-card-content';

        const folder = document.createElement('span');
        folder.className = 'folder-card-folder';
        folder.textContent = article.folderName;

        const title = document.createElement('h2');
        title.textContent = article.title || article.folderName;

        const footer = document.createElement('div');
        footer.className = 'article-card-footer';

        const editLink = document.createElement('a');
        editLink.className = 'article-card-action article-card-action-edit';
        editLink.href = `markdown-editor.html?${queryParams}`;
        editLink.textContent = 'Editar';
        editLink.setAttribute('aria-label', `Editar ${article.title || article.folderName}`);

        const publishLink = document.createElement('a');
        publishLink.className = 'article-card-action article-card-action-publish';
        publishLink.href = `publish.html?${queryParams}`;
        publishLink.textContent = 'Publicar';
        publishLink.setAttribute('aria-label', `Publicar ${article.title || article.folderName}`);

        footer.append(editLink, publishLink);
        content.append(folder, title, createArticleMeta(article), footer);
        card.append(image, content);
        articleCardList.append(card);
    }
}

async function readArticles(collectionHandle) {
    const articles = [];

    for await (const [folderName, folderHandle] of collectionHandle.entries()) {
        if (folderHandle.kind !== 'directory') {
            continue;
        }

        try {
            const indexFileHandle = await folderHandle.getFileHandle('index.md');
            const indexFile = await indexFileHandle.getFile();
            const metadata = parseArticleFrontmatter(await indexFile.text());
            articles.push({ ...metadata, folderName });
        } catch (error) {
            if (error.name === 'NotFoundError') {
                continue;
            }

            throw new Error(`Não foi possível ler a subpasta "${folderName}": ${error.message}`);
        }
    }

    return articles.sort((first, second) => (first.title || first.folderName).localeCompare(second.title || second.folderName));
}

async function loadArticles(rootHandle) {
    const articlesHandle = await rootHandle.getDirectoryHandle('articles');
    loadedArticles = await readArticles(articlesHandle);
    renderArticleStatusFilters(loadedArticles);
    articleStatusAll.checked = true;
    filterAndSortArticles();
    setArticlesStatus(`${loadedArticles.length} artigo(s) carregado(s).`, 'success');
}

async function restoreArticles() {
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            setArticlesStatus('Nenhum workspace aberto. Use Open para selecionar uma pasta.');
            return;
        }

        const permission = await rootHandle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
            setArticlesStatus('Conceda acesso ao workspace para carregar os artigos.');
            return;
        }

        await loadArticles(rootHandle);
    } catch (error) {
        loadedArticles = [];
        renderArticleStatusFilters(loadedArticles);
        renderArticles([]);
        setArticlesStatus(error.name === 'NotFoundError'
            ? 'A pasta articles não foi encontrada no workspace.'
            : error.message || 'Não foi possível carregar os artigos.', 'error');
    }
}

articleSearch.addEventListener('input', filterAndSortArticles);
articleSort.addEventListener('change', filterAndSortArticles);
articleStatusAll.addEventListener('change', () => {
    if (articleStatusAll.checked) {
        articleStatusOptions.querySelectorAll('input').forEach(input => {
            input.checked = false;
        });
    }
    filterAndSortArticles();
});
restoreArticles();
const calendarState = {
    date: new Date(),
    view: 'month',
    events: []
};

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const longDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
});
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 1 + index);
    return weekdayFormatter.format(date).replace('.', '');
});

const calendarTitle = document.querySelector('[data-calendar-title]');
const calendarGrid = document.querySelector('[data-calendar-grid]');
const viewButtons = document.querySelectorAll('[data-calendar-view]');
const contentTypeLabels = {
    articles: 'article',
    careers: 'career',
    components: 'component',
    courses: 'course',
    formations: 'formation',
    ibooks: 'ibook',
    images: 'image',
    snippets: 'snippet',
    themes: 'theme',
    videos: 'video'
};
const contentCollectionNames = Object.fromEntries(
    Object.entries(contentTypeLabels).map(([collectionName, type]) => [type, collectionName])
);

const normalizeValue = (value = '') => value.trim().replace(/^['"]|['"]$/g, '');

const parseFrontmatter = (markdown) => {
    const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatterMatch) {
        return {};
    }

    return Object.fromEntries(
        frontmatterMatch[1]
            .split(/\r?\n/)
            .filter(line => line.trim())
            .map(line => {
                const separatorIndex = line.indexOf(':');
                return separatorIndex === -1
                    ? ['', '']
                    : [line.slice(0, separatorIndex).trim(), normalizeValue(line.slice(separatorIndex + 1))];
            })
    );
};

const toTypeLabel = (folderName) => contentTypeLabels[folderName.toLowerCase()]
    || folderName.replace(/s$/, '').toLowerCase();

const toStatusClass = (status) => normalizeValue(status).toLowerCase().replace(/[^a-z0-9]+/g, '-');

const getDateKey = (date) => [date.getFullYear(), date.getMonth(), date.getDate()].join('-');

const getEventsForDate = (date) => calendarState.events.filter(event => getDateKey(event.date) === getDateKey(date));

const getEventPage = (type) => `${contentCollectionNames[type] || `${type}s`}.html`;

const renderEvent = (event) => {
    const item = document.createElement('a');
    item.className = 'calendar-event';
    item.classList.add(`calendar-event-status-${toStatusClass(event.status)}`);
    item.href = getEventPage(event.type);
    item.setAttribute('aria-label', `Abrir ${event.title}`);
    item.addEventListener('click', () => {
        const collectionName = contentCollectionNames[event.type] || `${event.type}s`;
        localStorage.setItem(`studio-${collectionName}-last-${event.type}`, event.folderName);
    });

    const type = document.createElement('span');
    type.className = 'calendar-event-type';
    type.textContent = event.type;

    const title = document.createElement('strong');
    title.className = 'calendar-event-title';
    title.textContent = event.title;

    const status = document.createElement('span');
    status.className = 'calendar-event-status';
    status.textContent = event.status;

    item.append(type, title, status);
    return item;
};

const renderEvents = (container, date) => {
    const events = getEventsForDate(date);
    if (!events.length) {
        return;
    }

    const eventList = document.createElement('div');
    eventList.className = 'calendar-event-list';
    events.forEach(event => eventList.append(renderEvent(event)));
    container.append(eventList);
};

const renderCalendarMessage = (message) => {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'calendar-grid-message';
    emptyMessage.textContent = message;
    calendarGrid.append(emptyMessage);
};

const startOfWeek = (date) => {
    const result = new Date(date);
    const day = result.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    result.setDate(result.getDate() - daysFromMonday);
    result.setHours(0, 0, 0, 0);
    return result;
};

const isSameDay = (firstDate, secondDate) => firstDate.toDateString() === secondDate.toDateString();

const createCell = (date, options = {}) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    if (options.muted) {
        cell.classList.add('is-muted');
    }
    if (isSameDay(date, new Date())) {
        cell.classList.add('is-today');
    }

    const dateLabel = document.createElement('span');
    dateLabel.className = 'calendar-date';
    dateLabel.textContent = date.getDate();
    cell.append(dateLabel);
    renderEvents(cell, date);
    return cell;
};

const renderWeekdays = () => {
    weekdays.forEach((weekday) => {
        const header = document.createElement('div');
        header.className = 'calendar-weekday';
        header.textContent = weekday;
        calendarGrid.append(header);
    });
};

const renderMonth = () => {
    renderWeekdays();
    const firstDay = new Date(calendarState.date.getFullYear(), calendarState.date.getMonth(), 1);
    const firstVisibleDay = startOfWeek(firstDay);

    for (let index = 0; index < 42; index += 1) {
        const date = new Date(firstVisibleDay);
        date.setDate(firstVisibleDay.getDate() + index);
        calendarGrid.append(createCell(date, { muted: date.getMonth() !== calendarState.date.getMonth() }));
    }
};

const renderWeek = () => {
    renderWeekdays();
    const firstDay = startOfWeek(calendarState.date);

    for (let index = 0; index < 7; index += 1) {
        const date = new Date(firstDay);
        date.setDate(firstDay.getDate() + index);
        const cell = createCell(date);
        cell.classList.add('calendar-week-cell');
        cell.querySelector('.calendar-date').textContent = `${date.getDate()} ${date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`;
        calendarGrid.append(cell);
    }
};

const renderDay = () => {
    const cell = createCell(calendarState.date);
    cell.classList.add('calendar-day-card');
    cell.querySelector('.calendar-date').textContent = longDateFormatter.format(calendarState.date);

    if (!getEventsForDate(calendarState.date).length) {
        const message = document.createElement('p');
        message.className = 'calendar-empty-message';
        message.textContent = 'Nenhum conteúdo agendado para este dia.';
        cell.append(message);
    }
    calendarGrid.append(cell);
};

const updateTitle = () => {
    if (calendarState.view === 'month') {
        calendarTitle.textContent = monthFormatter.format(calendarState.date);
        return;
    }

    if (calendarState.view === 'week') {
        const firstDay = startOfWeek(calendarState.date);
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 6);
        calendarTitle.textContent = `${firstDay.getDate()} - ${lastDay.getDate()} ${lastDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
        return;
    }

    calendarTitle.textContent = longDateFormatter.format(calendarState.date);
};

const renderCalendar = () => {
    calendarGrid.replaceChildren();
    updateTitle();

    if (calendarState.view === 'month') {
        renderMonth();
    } else if (calendarState.view === 'week') {
        renderWeek();
    } else {
        renderDay();
    }
};

const readPublishedEvent = async (directoryHandle, type) => {
    try {
        const indexFileHandle = await directoryHandle.getFileHandle('index.md');
        const indexFile = await indexFileHandle.getFile();
        const metadata = parseFrontmatter(await indexFile.text());
        const date = new Date(metadata.published_at_utc);

        if (!metadata.published_at_utc || Number.isNaN(date.getTime())) {
            return null;
        }

        return {
            date,
            folderName: directoryHandle.name,
            status: metadata.status || 'sem status',
            title: metadata.title || directoryHandle.name,
            type
        };
    } catch (error) {
        if (error.name !== 'NotFoundError') {
            console.warn(`Não foi possível ler ${directoryHandle.name}/index.md.`, error);
        }
        return null;
    }
};

const collectScheduledEvents = async (directoryHandle, type = '') => {
    const events = [];
    const currentEvent = await readPublishedEvent(directoryHandle, type);
    if (currentEvent) {
        events.push(currentEvent);
    }

    for await (const [, handle] of directoryHandle.entries()) {
        if (handle.kind === 'directory') {
            events.push(...await collectScheduledEvents(handle, type || toTypeLabel(directoryHandle.name)));
        }
    }

    return events;
};

const loadScheduledEvents = async () => {
    try {
        const rootHandle = await getSavedFolderHandle();
        if (!rootHandle) {
            renderCalendarMessage('Abra uma pasta no Studio para exibir os conteúdos agendados.');
            return;
        }

        const permission = await rootHandle.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
            renderCalendarMessage('Conceda acesso à pasta aberta para exibir os conteúdos agendados.');
            return;
        }

        calendarState.events = [];
        for await (const [name, handle] of rootHandle.entries()) {
            if (handle.kind === 'directory') {
                calendarState.events.push(...await collectScheduledEvents(handle, toTypeLabel(name)));
            }
        }
        calendarState.events.sort((first, second) => first.date - second.date);
        renderCalendar();
    } catch (error) {
        renderCalendarMessage('Não foi possível carregar os conteúdos agendados.');
        console.warn(error);
    }
};

const moveCalendar = (amount) => {
    if (calendarState.view === 'month') {
        calendarState.date.setMonth(calendarState.date.getMonth() + amount);
    } else {
        const days = calendarState.view === 'week' ? 7 : 1;
        calendarState.date.setDate(calendarState.date.getDate() + amount * days);
    }
    renderCalendar();
};

document.querySelector('[data-calendar-previous]').addEventListener('click', () => moveCalendar(-1));
document.querySelector('[data-calendar-next]').addEventListener('click', () => moveCalendar(1));
document.querySelector('[data-calendar-today]').addEventListener('click', () => {
    calendarState.date = new Date();
    renderCalendar();
});

viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
        calendarState.view = button.dataset.calendarView;
        viewButtons.forEach((viewButton) => {
            const isActive = viewButton === button;
            viewButton.classList.toggle('is-active', isActive);
            viewButton.setAttribute('aria-selected', String(isActive));
        });
        renderCalendar();
    });
});

renderCalendar();
loadScheduledEvents();
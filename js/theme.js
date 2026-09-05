const themeStorageKey = 'studio-theme';

// Applied before body renders to avoid a flash of the wrong theme.
if (localStorage.getItem(themeStorageKey) === 'dark') {
    document.documentElement.classList.add('dark');
}

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.querySelector('#theme-toggle');
    if (!themeToggle) {
        return;
    }

    const updateThemeButton = () => {
        const isDark = document.documentElement.classList.contains('dark');
        const label = isDark ? 'Ativar tema claro' : 'Ativar tema escuro';
        themeToggle.setAttribute('aria-label', label);
        themeToggle.setAttribute('title', label);
        themeToggle.setAttribute('aria-pressed', String(isDark));
        themeToggle.querySelector('.header-button-icon').className = isDark
            ? 'ri-sun-line header-button-icon'
            : 'ri-moon-line header-button-icon';
    };

    themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem(themeStorageKey, document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        updateThemeButton();
    });

    updateThemeButton();
});

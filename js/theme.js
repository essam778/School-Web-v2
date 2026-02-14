// js/theme.js
(function () {
    const theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'light') {
        document.documentElement.classList.add('light-theme');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            // Set initial icon
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
            }

            toggleBtn.addEventListener('click', () => {
                const isLight = document.documentElement.classList.toggle('light-theme');
                const newTheme = isLight ? 'light' : 'dark';
                localStorage.setItem('theme', newTheme);

                if (icon) {
                    icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
                }
            });
        }
    });
})();

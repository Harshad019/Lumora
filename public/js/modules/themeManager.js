/**
 * Lumora - Theme Manager
 * Controls persistent Light and Dark themes.
 * Adapts all UI tokens and coordinates live chart theme updates.
 */

const STORAGE_KEY = 'lumora-theme';
const listeners = [];

/**
 * Returns currently active theme ('light' | 'dark')
 */
export function getActiveTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }
  // Fallback to system preference (default to light if no preference)
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Applies a theme ('light' | 'dark')
 */
export function setTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', nextTheme);
  try {
    localStorage.setItem(STORAGE_KEY, nextTheme);
  } catch (e) {
    // LocalStorage might be disabled in private mode
  }

  updateToggleButton(nextTheme);

  // Notify listeners (e.g. chart manager to refresh canvases)
  for (const fn of listeners) {
    try {
      fn(nextTheme);
    } catch (err) {
      console.error('Error notifying theme listener:', err);
    }
  }
}

/**
 * Toggles between light and dark
 */
export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getActiveTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Register callback for theme change
 */
export function onThemeChange(callback) {
  if (typeof callback === 'function') {
    listeners.push(callback);
  }
}

/**
 * Updates toggle button visual state & aria attributes
 */
function updateToggleButton(theme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;

  const isDark = theme === 'dark';
  btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');

  btn.innerHTML = isDark
    ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
         <circle cx="12" cy="12" r="5"></circle>
         <line x1="12" y1="1" x2="12" y2="3"></line>
         <line x1="12" y1="21" x2="12" y2="23"></line>
         <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
         <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
         <line x1="1" y1="12" x2="3" y2="12"></line>
         <line x1="21" y1="12" x2="23" y2="12"></line>
         <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
         <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
       </svg>
       <span class="theme-toggle-label">Light</span>`
    : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
         <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
       </svg>
       <span class="theme-toggle-label">Dark</span>`;
}

/**
 * Initializes theme on page boot
 */
export function initTheme() {
  const initialTheme = getActiveTheme();
  setTheme(initialTheme);

  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      toggleTheme();
    });
  }

  // Listen for OS scheme changes if user hasn't set explicit preference
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

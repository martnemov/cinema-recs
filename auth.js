'use strict';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

async function startCinema() {
  const status = document.querySelector('#auth-status');
  try {
    const response = await fetch('/api/yandex-session', {cache: 'no-store'});
    if (response.status === 401) {
      const error = new URLSearchParams(location.search).get('auth');
      status.textContent = error === 'failed' ? 'Войти не удалось. Попробуйте ещё раз.'
        : error === 'unavailable' ? 'Вход временно недоступен.'
        : 'Войдите, чтобы загрузить оценки Кинопоиска по вашему логину Яндекса.';
      document.querySelector('#yandex-login').hidden = false;
      return;
    }
    if (!response.ok) throw new Error('Session unavailable');
    window.CINEMA_USER = await response.json();
    await Promise.all([loadScript('/data.js?v=4'), loadScript('/state.js?v=4')]);
    if (window.CINEMA_USER.login === 'martnemov') {
      await loadScript('/ratings.js?v=4');
    } else {
      window.CINEMA_RATINGS = [];
      window.CINEMA_LEGACY_IDS = [];
    }
    await loadScript('/app.js?v=6');
    if (window.CINEMA_USER.login === 'martnemov') {
      await loadScript('/backup.js?v=1');
    }
    document.querySelector('#sign-in').hidden = true;
    document.querySelector('#cinema-app').hidden = false;
  } catch {
    status.textContent = 'Не удалось загрузить сайт. Обновите страницу.';
  }
}

startCinema();

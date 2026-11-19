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
      const message = error === 'failed' ? 'Войти не удалось. Попробуйте ещё раз.'
        : error === 'unavailable' ? 'Вход временно недоступен.' : '';
      status.textContent = message;
      status.hidden = !message;
      document.querySelector('#yandex-login').hidden = false;
      return;
    }
    if (!response.ok) throw new Error('Session unavailable');
    window.CINEMA_USER = await response.json();
    document.querySelector('#account-name').textContent = window.CINEMA_USER.name || window.CINEMA_USER.login;
    const profileKey = 'next-frame-kp-profile:' + window.CINEMA_USER.id;
    let profileId = '';
    try { profileId = localStorage.getItem(profileKey) || ''; } catch {}
    window.CINEMA_PROFILE_ID = /^[1-9][0-9]{0,15}$/.test(profileId) ? profileId : '';
    const useArchive = window.CINEMA_USER.login === 'martnemov' && !window.CINEMA_PROFILE_ID;
    await Promise.all([loadScript('/data.js?v=4'), loadScript('/state.js?v=5')]);
    if (useArchive) {
      await loadScript('/ratings.js?v=4');
    } else {
      window.CINEMA_RATINGS = [];
      window.CINEMA_LEGACY_IDS = [];
    }
    await loadScript('/app.js?v=8');
    document.querySelector('.backup-controls').hidden = !useArchive;
    if (useArchive) {
      await loadScript('/backup.js?v=1');
    }
    document.querySelector('#sign-in').hidden = true;
    document.querySelector('#cinema-app').hidden = false;
  } catch {
    status.textContent = 'Не удалось загрузить сайт. Обновите страницу.';
  }
}

startCinema();

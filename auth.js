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
        : 'Войдите, чтобы загрузить оценки Кинопоиска из вашего профиля.';
      document.querySelector('#yandex-login').hidden = false;
      return;
    }
    if (!response.ok) throw new Error('Session unavailable');
    window.CINEMA_USER = await response.json();
    const profileKey = 'next-frame-kp-profile:' + window.CINEMA_USER.id;
    let profileId = '';
    try { profileId = localStorage.getItem(profileKey) || ''; } catch {}
    window.CINEMA_PROFILE_ID = /^[1-9][0-9]{0,15}$/.test(profileId) ? profileId : '';
    const field = document.querySelector('#kp-profile');
    field.value = window.CINEMA_PROFILE_ID;
    field.addEventListener('input', () => field.setCustomValidity(''));
    document.querySelector('#kp-profile-form').addEventListener('submit', event => {
      event.preventDefault();
      const value = field.value.trim();
      const match = /^(?:https:\/\/(?:www\.)?kinopoisk\.ru\/user\/)?([1-9][0-9]{0,15})(?:\/.*)?$/i.exec(value);
      if (value && !match) {
        field.setCustomValidity('Введите числовой ID или ссылку на профиль Кинопоиска.');
        field.reportValidity();
        return;
      }
      try {
        if (match) localStorage.setItem(profileKey, match[1]);
        else localStorage.removeItem(profileKey);
        location.reload();
      } catch {
        field.setCustomValidity('Браузер не смог сохранить профиль.');
        field.reportValidity();
      }
    });
    const useArchive = window.CINEMA_USER.login === 'martnemov' && !window.CINEMA_PROFILE_ID;
    await Promise.all([loadScript('/data.js?v=4'), loadScript('/state.js?v=4')]);
    if (useArchive) {
      await loadScript('/ratings.js?v=4');
    } else {
      window.CINEMA_RATINGS = [];
      window.CINEMA_LEGACY_IDS = [];
    }
    await loadScript('/app.js?v=7');
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

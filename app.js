'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const items = window.CINEMA_DATA;
const ratings = window.CINEMA_RATINGS;
const profileId = window.CINEMA_PROFILE_ID;
const curatedProfile = window.CINEMA_USER.login === 'martnemov' && !profileId;
const ratingsStorageKey = profileId
  ? 'next-frame-api-ratings-v1:' + window.CINEMA_USER.id + ':kp:' + profileId
  : window.CINEMA_USER.login === 'martnemov'
    ? 'next-frame-api-ratings-v1' : 'next-frame-api-ratings-v1:' + window.CINEMA_USER.id;
const recommendationSeed = [...items];
const archivedRatings = [...ratings];
const byId = new Map(items.map(item => [item.id, item]));
const ratingById = new Map(ratings.map(item => [item.id, item]));
const validIds = new Set([...byId.keys(), ...window.CINEMA_LEGACY_IDS]);
const fmt = new Intl.NumberFormat('ru-RU');
const pageSize = 24;
const labels = {film: 'Фильм', series: 'Сериал', cartoon: 'Мультфильм', anime: 'Аниме'};
const feedSort = {priority: 'По вашему вкусу', year: 'Сначала новые', rating: 'По рейтингу КП'};
const routes = {
  ratings: {title: 'Мои оценки', kicker: 'Кинопоиск', note: 'Фильмы, сериалы, мультфильмы и аниме, которым вы поставили оценку.',
    filters: {all: 'Все', film: 'Фильмы', series: 'Сериалы', cartoon: 'Мультфильмы', anime: 'Аниме'},
    sorts: {recent: 'По порядку в профиле', score: 'Сначала высокие оценки', year: 'Сначала новые', title: 'По названию'}},
  films: {title: 'Фильмы', kicker: 'Рекомендации', note: 'От классики до новинок. Сначала близкие вашему вкусу и более свежие фильмы.'},
  series: {title: 'Сериалы', kicker: 'Рекомендации', note: 'Подборка сериалов с учётом ваших оценок.'},
  animation: {title: 'Анимация и аниме', kicker: 'Рекомендации', note: 'Мультфильмы и аниме по вашему вкусу.',
    filters: {all: 'Всё', cartoon: 'Мультфильмы', anime: 'Аниме', feature: 'Полнометражные', episodic: 'Многосерийные'}},
  saved: {title: 'Сохранённое', kicker: 'Личная кинотека', note: 'Истории, которые вы отложили на потом.'},
};
const pools = {ratings, saved: items};
const legacyRoutes = {taste: 'home', collection: 'films'};
const bookmark = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>';
const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>';

let storage;
try { storage = window.localStorage; } catch { storage = null; }
const saved = CinemaState.readSet(storage, (window.CINEMA_USER.login === 'martnemov' ? 'next-frame-saved' : 'next-frame-saved:' + window.CINEMA_USER.id), validIds);
const watched = CinemaState.readSet(storage, (window.CINEMA_USER.login === 'martnemov' ? 'next-frame-watched' : 'next-frame-watched:' + window.CINEMA_USER.id), validIds);
let route = '', filter = 'all', query = '', sort = 'priority', limit = pageSize;
let currentId = null, toastTimer, undoAction, dialogTrigger;

function formatCount(n, [one, few, many] = ['история', 'истории', 'историй']) {
  const last = n % 10, two = n % 100;
  return fmt.format(n) + ' ' + (two >= 11 && two <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many);
}

function itemType(item) {
  if (item.type) return item.type;
  if (item.category === 'cartoon' && item.format === 'series') return 'Мультсериал';
  return labels[item.category];
}

function poster(item) {
  return item.score ? item.poster : `assets/poster-${item.id}.webp`;
}

function profileUrl(item) {
  return `https://www.kinopoisk.ru/${item.format}/${item.id}/`;
}

function notify(text, action = null) {
  $('#toast-text').textContent = text;
  undoAction = action;
  $('#toast-undo').hidden = !action;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').classList.remove('visible');
    undoAction = null;
  }, action ? 8000 : 2600);
}

function persist(key, value) {
  try {
    storage.setItem(key, JSON.stringify([...value]));
    return true;
  } catch {
    return false;
  }
}

function syncCounts() {
  const counts = CinemaState.count(items, watched);
  $('#home-ratings').textContent = formatCount(ratings.length, ['оценка', 'оценки', 'оценок']);
  $('#home-films').textContent = formatCount(counts.film, ['рекомендация', 'рекомендации', 'рекомендаций']);
  $('#home-series').textContent = formatCount(counts.series, ['рекомендация', 'рекомендации', 'рекомендаций']);
  $('#home-animation').textContent = formatCount(counts.cartoon + counts.anime, ['рекомендация', 'рекомендации', 'рекомендаций']);
  $('#saved-count').textContent = items.filter(item => saved.has(item.id) && !watched.has(item.id)).length;
  $('#watched-count').textContent = watched.size;
}

function toggleSaved(id) {
  if (!byId.has(id) || watched.has(id)) return;
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  const durable = persist((window.CINEMA_USER.login === 'martnemov' ? 'next-frame-saved' : 'next-frame-saved:' + window.CINEMA_USER.id), saved);
  notify(durable ? saved.has(id) ? 'Добавлено в сохранённое' : 'Убрано из сохранённого' : 'Изменение действует до перезагрузки');
  render();
  if (currentId === id && $('#detail').open) {
    const button = $('#modal-save');
    button.setAttribute('aria-pressed', String(saved.has(id)));
    button.innerHTML = bookmark + (saved.has(id) ? 'Сохранено' : 'На потом');
  }
}

function markWatched(id) {
  const item = byId.get(id);
  if (!item) return;
  watched.add(id);
  const durable = persist((window.CINEMA_USER.login === 'martnemov' ? 'next-frame-watched' : 'next-frame-watched:' + window.CINEMA_USER.id), watched);
  if ($('#detail').open) $('#detail').close();
  render();
  notify(`«${item.title}» убрано из рекомендаций${durable ? '' : ' до перезагрузки'}`, () => restoreWatched(id));
  $('#toast-undo').focus();
}

function restoreWatched(id) {
  watched.delete(id);
  const durable = persist((window.CINEMA_USER.login === 'martnemov' ? 'next-frame-watched' : 'next-frame-watched:' + window.CINEMA_USER.id), watched);
  render();
  renderHistory();
  if ($('#history').open) ($('#history [data-restore]') || $('#close-history')).focus();
  else if (document.activeElement === $('#toast-undo')) $('[data-open="' + id + '"]')?.focus();
  notify(durable ? 'Отметка «Просмотрено» снята' : 'Отметка снята до перезагрузки');
}

function visibleItems() {
  return CinemaState.select(pools[route], {
    filter: route === 'saved' ? 'saved' : filter,
    query, sort, saved,
    watched: route === 'ratings' ? new Set() : watched,
  });
}

function recommendationCard(item) {
  const isSaved = saved.has(item.id);
  return `<article class="card" data-id="${item.id}">
    <div class="poster-wrap">
      <button class="poster-open" data-open="${item.id}" aria-label="Подробнее: ${esc(item.title)}"><img src="${poster(item)}" alt="" width="600" height="900" loading="lazy" decoding="async"></button>
      <button class="bookmark" data-save="${item.id}" aria-label="Закладка: ${esc(item.title)}" aria-pressed="${isSaved}">${bookmark}</button>
    </div>
    <div class="card-info">
      <div class="card-title-line"><button class="card-title" data-open="${item.id}">${esc(item.title)}</button><a class="kp-rating" href="${esc(item.kinopoisk_url)}" target="_blank" rel="noopener noreferrer" aria-label="Рейтинг Кинопоиска ${item.kinopoisk_rating.toFixed(1)} из 10">${item.kinopoisk_rating.toFixed(1)}</a></div>
      <div class="card-sub">${item.year} · ${esc(item.type)}</div>
      ${item.match_label ? `<div class="card-match">${esc(item.match_label)}</div>` : ''}
      <button class="watched-button" data-watched="${item.id}" aria-label="Отметить как просмотренное: ${esc(item.title)}">${check}Просмотрено</button>
    </div>
  </article>`;
}

function ratingCard(item) {
  const title = esc(item.title), url = profileUrl(item);
  return `<article class="card" data-id="${item.id}">
    <div class="poster-wrap">
      <a class="poster-open rating-link" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${title} на Кинопоиске">
        <span class="poster-placeholder" aria-hidden="true">к.</span><img src="${esc(poster(item))}" alt="" width="268" height="402" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      </a>
    </div>
    <div class="card-info">
      <div class="card-title-line"><a class="card-title" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a><span class="kp-rating personal-score" aria-label="Ваша оценка ${item.score} из 10">${item.score}/10</span></div>
      <div class="card-sub">${[item.year, itemType(item), item.genre !== 'мультфильм' && item.genre !== 'аниме' ? item.genre : ''].filter(Boolean).map(esc).join(' · ')}</div>
    </div>
  </article>`;
}

function render() {
  syncCounts();
  if (route === 'home') return;
  const active = document.activeElement;
  const bookmarkId = active?.dataset.save;
  const list = visibleItems();
  const ratingMode = route === 'ratings';
  $('#result-count').textContent = formatCount(list.length, ratingMode ? ['оценка', 'оценки', 'оценок'] : undefined);
  $('#empty').hidden = !!list.length;
  $('#empty-text').textContent = query ? 'По этому запросу ничего не найдено.' :
    route === 'saved' ? 'Нажмите на закладку у постера, чтобы сохранить историю.' : 'В этом списке пока нет историй.';
  $('#reset').hidden = !query && filter === 'all';
  $('#random').hidden = ratingMode || route === 'saved';
  $('#random').disabled = !list.length;
  const more = $('#load-more');
  more.hidden = list.length <= limit;
  more.textContent = `Показать ещё ${Math.min(pageSize, Math.max(0, list.length - limit))}`;
  const grid = $('#grid');
  grid.innerHTML = list.slice(0, limit).map(ratingMode ? ratingCard : recommendationCard).join('');
  if (bookmarkId && !active.isConnected) (grid.querySelector(`[data-save="${bookmarkId}"]`) || $('#library-heading')).focus();
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
}

function showRoute({focus = false} = {}) {
  const hash = location.hash.slice(1);
  const next = Object.hasOwn(routes, hash) ? hash : Object.hasOwn(legacyRoutes, hash) ? legacyRoutes[hash] : 'home';
  if (next === route) return;
  route = next;
  filter = 'all';
  query = '';
  limit = pageSize;
  $('#home').hidden = route !== 'home';
  $('#library').hidden = route === 'home';
  document.querySelectorAll('[data-route]').forEach(link => {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (route !== 'home') {
    const config = routes[route];
    $('#library-heading').textContent = config.title;
    $('#library-kicker').textContent = config.kicker;
    $('#library-note').textContent = config.note;
    $('#search').value = '';
    const filters = Object.entries(config.filters || {});
    $('#filters').hidden = !filters.length;
    $('#filters').innerHTML = filters.map(([key, label]) => `<button data-filter="${key}" aria-pressed="false">${label}</button>`).join('');
    const sorts = Object.entries(config.sorts || feedSort);
    sort = sorts[0][0];
    $('#sort').innerHTML = sorts.map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
  }
  render();
  if (focus) {
    window.scrollTo({top: 0, behavior: 'instant'});
    $(route === 'home' ? '#main' : '#library-heading').focus({preventScroll: true});
  }
}

function openDetail(id, trigger) {
  const item = byId.get(id);
  if (!item || watched.has(id)) return;
  currentId = id;
  dialogTrigger = trigger;
  const rating = item.kinopoisk_rating.toFixed(1);
  const references = (item.rating_references || []).map(id => ratingById.get(id)).filter(Boolean);
  $('#dialog-content').innerHTML = `<div class="modal-layout">
    <div class="modal-poster"><img src="${poster(item)}" alt="" width="600" height="900"></div>
    <div class="modal-copy">
      <div class="eyebrow">${esc(item.type)} · ${item.year}</div>
      <h2 id="dialog-title">${esc(item.title)}</h2>
      <div class="modal-original">${esc(item.original_title)}<br>${esc(item.genres.join(' · '))}</div>
      <div class="modal-rating"><strong>${rating}</strong><span>Рейтинг Кинопоиска · ${fmt.format(item.rating_count)} оценок</span></div>
      ${item.why ? `<div class="modal-section"><h3>Почему рекомендуем</h3><p>${esc(item.why)}</p>${references.length ? `<p class="rating-references">Ваши оценки · ${references.map(ref => `«${esc(ref.title)}» ${ref.score}/10`).join(' · ')}</p>` : ''}</div>` : ''}
      ${item.caveat ? `<div class="modal-section"><h3>Перед просмотром</h3><p>${esc(item.caveat)}</p></div>` : ''}
      <div class="modal-buttons">
        <a class="button primary" href="${esc(item.kinopoisk_url)}" target="_blank" rel="noopener noreferrer">На Кинопоиске <span aria-hidden="true">↗</span></a>
        <button class="button secondary" id="modal-save" data-save="${id}" aria-pressed="${saved.has(id)}">${bookmark}${saved.has(id) ? 'Сохранено' : 'На потом'}</button>
        <button class="button secondary mark-modal" data-watched="${id}">${check}Просмотрено</button>
      </div>
    </div>
  </div>`;
  openDialog('#detail', '#close-modal');
}

function renderHistory() {
  $('#history-empty').hidden = watched.size > 0;
  $('#history-list').innerHTML = [...watched].map(id => {
    const item = byId.get(id) || ratingById.get(id);
    if (!item) return `<li><div><strong>Карточка Кинопоиска ${id}</strong></div><button data-restore="${id}">Снять отметку</button></li>`;
    return `<li><img src="${esc(poster(item))}" alt="" width="42" height="63" loading="lazy"><div><strong>${esc(item.title)}</strong><span>${item.year || ''} · ${esc(itemType(item))}</span></div><button data-restore="${id}" aria-label="Снять отметку: ${esc(item.title)}">${byId.has(id) ? 'Вернуть ↗' : 'Снять отметку'}</button></li>`;
  }).join('');
}

function openDialog(selector, closeButton) {
  $(selector).showModal();
  document.body.style.overflow = 'hidden';
  $(closeButton).focus();
}

for (const [selector, button] of [['#detail', '#close-modal'], ['#history', '#close-history']]) {
  const dialog = $(selector);
  $(button).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
    if (selector === '#detail') currentId = null;
    if (dialogTrigger?.isConnected) dialogTrigger.focus();
    dialogTrigger = null;
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-watched], [data-restore], [data-save], [data-open], [data-filter]');
  if (!button) return;
  if (button.dataset.watched) markWatched(Number(button.dataset.watched));
  else if (button.dataset.restore) restoreWatched(Number(button.dataset.restore));
  else if (button.dataset.save) toggleSaved(Number(button.dataset.save));
  else if (button.dataset.open) openDetail(Number(button.dataset.open), button);
  else {
    filter = button.dataset.filter;
    limit = pageSize;
    render();
  }
});

$('.skip').addEventListener('click', event => {
  event.preventDefault();
  $('#main').focus();
});

$('#grid').addEventListener('error', event => {
  if (event.target.tagName === 'IMG') event.target.hidden = true;
}, true);
$('#open-history').addEventListener('click', () => {
  renderHistory();
  dialogTrigger = $('#open-history');
  openDialog('#history', '#close-history');
});
$('#toast-undo').addEventListener('click', () => undoAction?.());
$('#search').addEventListener('input', event => { query = event.target.value.trim(); limit = pageSize; render(); });
$('#sort').addEventListener('change', event => { sort = event.target.value; limit = pageSize; render(); });
$('#reset').addEventListener('click', () => {
  filter = 'all'; query = ''; limit = pageSize;
  $('#search').value = '';
  render();
  $('#search').focus();
});
$('#load-more').addEventListener('click', () => {
  const firstNew = limit;
  limit += pageSize;
  render();
  $('#grid').children[firstNew]?.querySelector('button, a')?.focus();
});
$('#random').addEventListener('click', () => {
  const list = visibleItems();
  if (list.length) openDetail(list[Math.floor(Math.random() * list.length)].id, $('#random'));
});
window.addEventListener('hashchange', () => showRoute({focus: true}));
updateRecommendations();
showRoute();


// API updates run after the initial local rendering; no browser receives the API key.
let ratingsSyncPending = false;
function validApiRatings(list) {
  return Array.isArray(list) && list.length > 0 && list.length <= 10000 && list.every(item =>
    item && Number.isSafeInteger(item.id) && item.id > 0 && Number.isInteger(item.score) &&
    item.score >= 1 && item.score <= 10 && typeof item.title === 'string' && item.title &&
    ['film','series','cartoon','anime'].includes(item.category) && ['film','series'].includes(item.format));
}
function updateRecommendations() {
  const recommendations = CinemaState.recommendations(recommendationSeed, ratings, {curated: curatedProfile});
  items.splice(0, items.length, ...recommendations);
  byId.clear();
  for (const item of items) byId.set(item.id, item);
  pools.films = items.filter(item => item.category === 'film');
  pools.series = items.filter(item => item.category === 'series');
  pools.animation = items.filter(CinemaState.isAnimation);
}

function applyApiRatings(snapshot, save = true) {
  if (!validApiRatings(snapshot.items)) throw Error('Invalid ratings snapshot');
  const incoming = new Map(snapshot.items.map(item => [item.id, item]));
  const merged = [...incoming.values(), ...archivedRatings.filter(item => !incoming.has(item.id))];
  ratings.splice(0, ratings.length, ...merged);
  ratingById.clear();
  for (const item of ratings) { ratingById.set(item.id, item); validIds.add(item.id); }
  updateRecommendations();
  if ($('#detail').open && !byId.has(currentId)) $('#detail').close();
  render();
  if (save) try { storage?.setItem(ratingsStorageKey, JSON.stringify({version:1,...snapshot,items:merged})); } catch {}
}
function showRatingsSync(snapshot, cached = false) {
  const date = new Date(snapshot.syncedAt);
  const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  $('#sync-title').textContent = cached ? 'Показана сохранённая история' : 'Оценки обновлены из API';
  const count = Number(snapshot.apiCount) || 0;
  const archived = Math.max(0, ratings.length - count);
  $('#sync-message').textContent = `Из API: ${fmt.format(count)} · ${archived ? `из архива: ${fmt.format(archived)} · ` : ''}${time}.`;
}
async function refreshApiRatings() {
  if (ratingsSyncPending) return;
  ratingsSyncPending = true;
  const button = $('#refresh-ratings'), progress = $('#sync-progress');
  button.disabled = true;
  progress.hidden = false; progress.removeAttribute('value');
  $('#sync-title').textContent = 'Обновляю личные оценки';
  $('#sync-message').textContent = 'Можно пользоваться сайтом. Сохранённая история остаётся доступна.';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 270000);
  let completed = false;
  function accept(event) {
    if (event.type === 'cached') { applyApiRatings(event, false); return; }
    if (event.type === 'progress') {
      progress.max = event.totalPages; progress.value = event.page;
      $('#sync-message').textContent = `Загружено страниц: ${event.page} из ${event.totalPages}. Сохранённые оценки пока доступны.`;
    }
    if (event.type === 'ratings') { applyApiRatings(event); showRatingsSync(event); completed = true; }
    if (event.type === 'error') {
      const error = Error(event.message || 'API временно недоступен.');
      error.code = event.code;
      throw error;
    }
  }
  try {
    const endpoint = profileId ? '/api/ratings?profile=' + encodeURIComponent(profileId) : '/api/ratings';
    const response = await fetch(endpoint, {cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{Accept:'application/x-ndjson'}});
    if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw Error('Не удалось получить ответ сервера.');
    if (response.body?.getReader) {
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const {done,value} = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), {stream:!done});
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) if (line.trim()) accept(JSON.parse(line));
        if (done) { if (buffer.trim()) accept(JSON.parse(buffer)); break; }
      }
    } else { for (const line of (await response.text()).split('\n')) if (line.trim()) accept(JSON.parse(line)); }
    if (!completed) throw Error('Обновление прервано до получения всех страниц.');
  } catch (error) {
    if (error.code === 'EMPTY_PROFILE' && !ratings.length) {
      $('#sync-title').textContent = 'Не удалось найти оценки';
      $('#sync-message').textContent = 'Проверьте ссылку на профиль и доступность оценок в Кинопоиске.';
      return;
    }
    $('#sync-title').textContent = 'Показана сохранённая история';
    $('#sync-message').textContent = `${error.name === 'AbortError' ? 'Превышено время ожидания API.' : error.message} Оценки не удалены. Попробуйте обновить позже.`;
  } finally {
    clearTimeout(timeout); progress.hidden = true; button.disabled = false; ratingsSyncPending = false;
  }
}
try {
  const cached = JSON.parse(storage?.getItem(ratingsStorageKey) || 'null');
  if (cached?.version === 1 && validApiRatings(cached.items)) { applyApiRatings(cached, false); showRatingsSync(cached, true); }
} catch {}
$('#refresh-ratings').addEventListener('click', refreshApiRatings);
window.addEventListener('pageshow', event => { if (event.persisted) refreshApiRatings(); });
refreshApiRatings();

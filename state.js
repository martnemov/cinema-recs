(function (root) {
  'use strict';

  const normalize = value => String(value).toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const isAnimation = item => item.category === 'cartoon' || item.category === 'anime';
  const matches = (item, filter) => filter === 'all' ||
    (filter === 'feature' ? isAnimation(item) && item.format === 'film' :
      filter === 'episodic' ? isAnimation(item) && item.format === 'series' : item.category === filter);

  function genresOf(item) {
    const genres = item.genres?.length ? item.genres : [item.genre];
    return [...new Set(genres.filter(Boolean).map(normalize))];
  }

  function recommendations(catalog, ratings, {curated = false} = {}) {
    const ratedIds = new Set();
    const genres = new Map();
    for (const item of ratings) {
      if (ratedIds.has(item.id)) continue;
      ratedIds.add(item.id);
      for (const genre of genresOf(item)) {
        const stats = genres.get(genre) || {count: 0, points: 0};
        stats.count++;
        stats.points += (item.score - 6) / 4;
        genres.set(genre, stats);
      }
    }

    return catalog.filter(item => !ratedIds.has(item.id)).map(item => {
      const tags = genresOf(item);
      const affinity = tags.reduce((sum, genre) => {
        const stats = genres.get(genre);
        // Three neutral observations limit the effect of a small ratings history.
        return sum + (stats ? stats.points / (stats.count + 3) : 0);
      }, 0) / (tags.length || 1);
      const baseline = curated ? -item.priority / 30 : item.kinopoisk_rating;
      const personalized = affinity > 0;
      return {
        ...item,
        recommendationScore: baseline + affinity * 2,
        match_label: curated ? item.match_label : personalized ? 'По вашим оценкам' : '',
        why: curated ? item.why : personalized ? 'Жанры этого тайтла совпадают с жанрами, которым вы ставили высокие оценки.' : '',
        rating_references: curated ? item.rating_references : [],
      };
    });
  }

  function select(items, {filter = 'all', query = '', sort = 'priority', saved = new Set(), watched = new Set()} = {}) {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    const order = {
      rating: (a, b) => b.kinopoisk_rating - a.kinopoisk_rating || a.priority - b.priority,
      score: (a, b) => b.score - a.score,
      year: (a, b) => (b.year || 0) - (a.year || 0),
      recent: () => 0,
      title: (a, b) => a.title.localeCompare(b.title, 'ru'),
      priority: (a, b) => (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0) || a.priority - b.priority,
    };
    return items.filter(item => {
      if (watched.has(item.id) || !(filter === 'saved' ? saved.has(item.id) : matches(item, filter))) return false;
      const text = normalize([item.title, item.original_title, item.year, item.genre, ...(item.genres || [])].filter(Boolean).join(' '));
      return terms.every(term => text.includes(term));
    }).sort(order[sort] || order.priority);
  }

  function readSet(storage, key, validIds) {
    try {
      const data = JSON.parse(storage.getItem(key) || '[]');
      return new Set(Array.isArray(data) ? data.filter(id => Number.isInteger(id) && validIds.has(id)) : []);
    } catch {
      return new Set();
    }
  }

  function count(items, watched) {
    const counts = {all: 0, film: 0, series: 0, anime: 0, cartoon: 0};
    for (const item of items) {
      if (watched.has(item.id)) continue;
      counts.all++;
      counts[item.category]++;
    }
    return counts;
  }

  root.CinemaState = {select, readSet, count, isAnimation, recommendations};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CinemaState;
})(typeof window !== 'undefined' ? window : globalThis);

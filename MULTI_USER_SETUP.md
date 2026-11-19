# Multi-user preview setup

Register a web application at https://oauth.yandex.ru/client/new/id/ with access to login:info. For a stable preview domain, set APP_ORIGIN to its HTTPS origin (no trailing slash). Register the exact redirect URL APP_ORIGIN + /api/auth?action=callback. Configure environment variables directly in Vercel, not in git:
- YANDEX_CLIENT_ID
- YANDEX_CLIENT_SECRET
- SESSION_SECRET (random >=32 characters, e.g. openssl rand -hex 32)
- APP_ORIGIN
- KINOPOISK_API_KEY (preview as well as production)
- LEGACY_OWNER_YANDEX_ID (optional immutable Yandex user ID; only this account with martnemov can merge the old archive)

Do not promote until OAuth, two distinct accounts, logout, direct API 401, rating and recommendation sync, quota handling, and cache isolation are tested. Profile is supplied by the user and is not proof of Kinopoisk profile ownership. Only public API data should be requested. Session cookies expire after seven days; profile must be entered after signing in again. Saved/watched marks are browser-local per account, not synced between devices. Old local marks can be imported using the existing export/import workflow. The imported ratings are not full viewing history. Existing historical exports in the public Git repository remain public. Before production consider moving legacy data out of public static assets, durable storage, per-user rate limiting and migration.
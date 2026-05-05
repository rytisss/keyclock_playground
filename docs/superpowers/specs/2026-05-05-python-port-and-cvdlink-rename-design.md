# Python port + CVDLINK realm rename — design

**Date:** 2026-05-05
**Status:** approved

## Goal

Convert the Keycloak playground's Node samples to Python, and rename the realm from `playground` to `cvdlink` everywhere it appears (export, code, docs).

## Scope

In scope:

- Replace `examples/node-api/` (Express + jose) with `examples/python-api/` (FastAPI + PyJWT).
- Replace the SPA's static-file server. The SPA HTML/JS keeps its current location; it gets a small FastAPI `server.py` next to `index.html` so both apps run on the same stack (uvicorn).
- Rename the realm `playground` → `cvdlink`. `displayName` becomes `CVDLINK`. All URLs, env vars, and docs follow.
- Rename the realm client `node-api` → `python-api`.
- Recapture the one screenshot that genuinely changes (`03-spa-post-login-claims.png` — JWT `iss` now contains `cvdlink`). Other screenshots keep working because the CVDLINK theme already hides the realm name on the login page and the API response bodies don't reference the realm.

Out of scope:

- Keycloak version, theme, ports, redirect URIs, default user credentials.
- BFF / cookie session migration. SPA continues to use `sessionStorage` (it's a learning sample).

## Layout after the change

```
examples/
├── python-api/                       # NEW (replaces node-api/)
│   ├── server.py                      # FastAPI + PyJWT, ~80 lines
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md
└── cvdlink-login-sample/
    ├── index.html                     # unchanged structure
    ├── app.js                         # one-line change: authority → /realms/cvdlink
    ├── server.py                      # NEW — FastAPI StaticFiles on :5173
    ├── requirements.txt
    └── README.md                      # uvicorn run command
```

`examples/node-api/` is deleted entirely.

## Components

### `examples/python-api/server.py`

FastAPI resource server. Mirrors the Express version 1:1.

Endpoints:

- `GET /public` — open, returns `{"message": "anyone can read this"}`.
- `GET /protected` — requires valid JWT. Returns `sub`, `preferred_username`, and the user's realm roles list.
- `GET /admin` — requires JWT + the `admin` realm role. Returns `{"message": "you are an admin", "user": <preferred_username>}`.

Auth:

- JWT verification uses `jwt.PyJWKClient(KC_JWKS_URI).get_signing_key_from_jwt(token).key` then `jwt.decode(token, key, algorithms=["RS256"], issuer=KC_ISSUER, options={"verify_aud": False})`. The `verify_aud` flag stays off until the user adds an Audience mapper, matching the comment on the existing Express version.
- A FastAPI dependency `require_auth(authorization: str = Header(None))` extracts the bearer token, verifies it, and returns the decoded payload. Returns 401 on missing/invalid token.
- A factory `require_role(role: str)` returns a dependency that checks `payload["realm_access"]["roles"]` contains `role`. Returns 403 otherwise.

CORS:

- `CORSMiddleware` with `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]` — matches `cors({ origin: true })` in the Node version.

Config (env, all optional with defaults):

- `PORT` — default `3001`
- `KC_ISSUER` — default `http://localhost:8081/realms/cvdlink`
- `KC_JWKS_URI` — default `${KC_ISSUER}/protocol/openid-connect/certs`

`requirements.txt`:

```
fastapi
uvicorn[standard]
pyjwt[crypto]
python-dotenv
```

Run command: `uvicorn server:app --port 3001`. The `__main__` block in `server.py` also calls `uvicorn.run(...)` so `python server.py` works as a fallback.

### `examples/cvdlink-login-sample/server.py`

Small FastAPI app that serves the static files in its own directory.

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()
app.mount("/", StaticFiles(directory=".", html=True), name="static")
```

`html=True` makes `/` return `index.html` and lets the OIDC redirect (`/?code=...&state=...`) hit the same page so the SPA's JS can pick up the query params. No other endpoints needed.

`requirements.txt`:

```
fastapi
uvicorn[standard]
```

Run command: `uvicorn server:app --port 5173`.

### `app.js` change

Single line:

```js
authority: "http://localhost:8081/realms/cvdlink",
```

Everything else in `app.js` is realm-agnostic.

### `realm-export.json` changes

- `realm`: `"playground"` → `"cvdlink"`
- `displayName`: `"Playground"` → `"CVDLINK"`
- Client `node-api` → `python-api` (`clientId` and `name` both updated). The client secret string changes from `node-api-secret-change-me` to `python-api-secret-change-me` for consistency. The README's default-credentials table is updated accordingly.
- Theme reference (`loginTheme: "cvdlink"`) unchanged.
- All redirect URIs, web origins, and roles unchanged.

> ⚠️ Because Keycloak's `--import-realm` skips realms that already exist, the docs already document running `docker compose down -v` after editing the export. That step still applies and gets called out in the README again.

### Docs

Find/replace + targeted rewrites across:

- `README.md` — realm/client rename, `node-api` → `python-api` everywhere (table rows, repo layout, quickstart commands, "Documentation" links).
- `docs/01-installation.md` — realm name in URLs and OIDC discovery doc paths.
- `docs/02-realm-setup.md` — manual click-through steps still match (realm name field is now `cvdlink`, displayName `CVDLINK`; client name updated).
- `docs/03-oidc-flow.md` — issuer URL and any `node-api` references in the Client Credentials section.
- `examples/python-api/README.md` — written from scratch, mirrors structure of the deleted `examples/node-api/README.md` (run + try-it sections).
- `examples/cvdlink-login-sample/README.md` — replaces the `python3 -m http.server` instruction with the uvicorn one; realm name updated; security notes unchanged.

### Screenshots

`docs/images/03-spa-post-login-claims.png` is the only one whose visible content depends on the realm name (the JWT decoded payload shows `iss: http://localhost:8081/realms/cvdlink`). All other screenshots — login page (CVDLINK theme hides the realm name by design), `/protected` and `/admin` API responses (no realm in the body) — remain accurate as-is.

Capture mechanism: a one-shot Playwright (Python) script in a tempdir, not committed. The script:

1. Boots stack assumed already running (`docker compose up -d`, `uvicorn` for both apps).
2. Opens `http://localhost:5173`, clicks Login, fills `researcher` / `researcher123`, clicks submit.
3. Waits for the post-login state to render (`#claims` populated).
4. Saves a viewport screenshot to `docs/images/03-spa-post-login-claims.png`.
5. Script and `node_modules` / browser cache are then discarded — Playwright is not added to project deps.

If Playwright doesn't run cleanly in this environment, fallback is to capture manually with macOS `screencapture` after walking through the flow in a real browser.

## Error handling

API server:

- Missing `Authorization: Bearer ...` header → 401 `{"error": "missing bearer token"}`.
- Invalid/expired/wrong-issuer token → 401 `{"error": "invalid token", "detail": "<jwt error message>"}`.
- Missing required role → 403 `{"error": "requires role: <role>"}`.

These match the Express version's response shapes byte-for-byte so the existing API-response screenshots stay valid.

SPA static server:

- Standard FastAPI/StaticFiles 404 for missing files. No custom handling needed.

## Testing

Manual smoke tests, walked through end-to-end:

1. `docker compose down -v && docker compose up -d`. Wait for Keycloak to import the renamed realm.
2. Hit `http://localhost:8081/realms/cvdlink/.well-known/openid-configuration` — must return 200 with `issuer: http://localhost:8081/realms/cvdlink`.
3. Boot both Python apps. Hit `http://localhost:3001/public` directly — must return 200.
4. `http://localhost:5173` → Login → `researcher` / `researcher123` → decoded JWT shows `iss: http://localhost:8081/realms/cvdlink`.
5. Click GET /protected as `researcher` → 200. Click GET /admin → 403.
6. Logout, login as `admin` / `admin123`. Click GET /admin → 200.

No unit tests added — this is a learning sample and the existing project doesn't have any.

## Implementation order

1. Delete `examples/node-api/`.
2. Update `realm-export.json` (realm + client rename).
3. Write `examples/python-api/` (server.py, requirements.txt, .env.example, README.md).
4. Write `examples/cvdlink-login-sample/server.py` + `requirements.txt`; update `app.js` authority; update its README.md.
5. Update top-level `README.md` and the three `docs/0*.md` files.
6. `docker compose down -v && up -d`. Smoke-test all six steps above.
7. Capture replacement screenshot `03-spa-post-login-claims.png` via Playwright.
8. Commit.

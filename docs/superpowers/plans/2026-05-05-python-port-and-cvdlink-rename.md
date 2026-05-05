# Python Port + CVDLINK Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Keycloak playground samples from Node.js to Python (FastAPI + uvicorn for both the resource-server API and the SPA static-file server), and rename the imported realm from `playground` to `cvdlink` everywhere it appears.

**Architecture:** Two FastAPI processes — one resource server validating Keycloak JWTs via PyJWT's `PyJWKClient`, one static-file server hosting the existing vanilla-JS SPA. The Node API is deleted outright; the SPA HTML/JS keeps its location (only its server changes). All `playground` references in the realm export, env defaults, code, and docs become `cvdlink`. The Keycloak `node-api` realm client is renamed to `python-api`.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, PyJWT (with `cryptography` extras for RS256), python-dotenv. Stack orchestration unchanged: Docker Compose with Keycloak 26 + Postgres 16. One-shot Playwright (Python) used only for the screenshot recapture, not committed.

**Spec:** [`docs/superpowers/specs/2026-05-05-python-port-and-cvdlink-rename-design.md`](../specs/2026-05-05-python-port-and-cvdlink-rename-design.md)

> **No automated tests.** The existing project has no test suite and the spec explicitly excludes adding one. Verification is end-to-end smoke testing against a real Keycloak (Task 10): `curl` against the API, browser-driven login on the SPA. The plan includes those checks as concrete commands with expected output.

---

## Task 1: Delete the Node API and stale `app/` directory

**Files:**
- Delete: `examples/node-api/` (entire directory)
- Delete: `app/` (entire directory — leftover `__pycache__` from a long-removed Python attempt)

- [ ] **Step 1: Delete the Node API directory**

```bash
rm -rf examples/node-api
```

- [ ] **Step 2: Delete the stale `app/` directory**

```bash
rm -rf app
```

- [ ] **Step 3: Verify both are gone**

```bash
ls examples/
```

Expected output: `cvdlink-login-sample` (only — no `node-api`).

```bash
ls -d app 2>/dev/null && echo "STILL THERE" || echo "gone"
```

Expected output: `gone`.

- [ ] **Step 4: Commit**

```bash
git add -A examples/node-api app
git commit -m "Remove node-api sample and stale app/ directory"
```

---

## Task 2: Rename realm `playground` → `cvdlink` and client `node-api` → `python-api` in `realm-export.json`

**Files:**
- Modify: `realm-export.json`

- [ ] **Step 1: Rewrite `realm-export.json` with the renamed realm and client**

Overwrite the file with this exact content:

```json
{
  "realm": "cvdlink",
  "enabled": true,
  "displayName": "CVDLINK",
  "loginTheme": "cvdlink",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "rememberMe": true,
  "sslRequired": "external",
  "accessTokenLifespan": 300,
  "ssoSessionIdleTimeout": 1800,
  "ssoSessionMaxLifespan": 36000,
  "roles": {
    "realm": [
      { "name": "user", "description": "Regular authenticated user" },
      { "name": "admin", "description": "Administrative user" }
    ]
  },
  "users": [
    {
      "username": "researcher",
      "enabled": true,
      "emailVerified": true,
      "firstName": "Researcher",
      "lastName": "User",
      "email": "researcher@example.com",
      "credentials": [
        { "type": "password", "value": "researcher123", "temporary": false }
      ],
      "realmRoles": ["user"]
    },
    {
      "username": "admin",
      "enabled": true,
      "emailVerified": true,
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@example.com",
      "credentials": [
        { "type": "password", "value": "admin123", "temporary": false }
      ],
      "realmRoles": ["user", "admin"]
    }
  ],
  "clients": [
    {
      "clientId": "spa-client",
      "name": "SPA Client (public, PKCE)",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": false,
      "redirectUris": [
        "http://localhost:5173/*",
        "http://localhost:3000/*"
      ],
      "webOrigins": [
        "http://localhost:5173",
        "http://localhost:3000"
      ],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:5173/*##http://localhost:3000/*"
      }
    },
    {
      "clientId": "python-api",
      "name": "Python API (confidential, client credentials)",
      "enabled": true,
      "publicClient": false,
      "secret": "python-api-secret-change-me",
      "standardFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": true,
      "bearerOnly": false,
      "attributes": {
        "access.token.lifespan": "300"
      }
    }
  ]
}
```

- [ ] **Step 2: Verify the JSON is well-formed**

```bash
python3 -m json.tool < realm-export.json > /dev/null && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Verify the realm name and client name changed**

```bash
grep -E '"realm":|"clientId": "python-api"|"clientId": "node-api"|"displayName":' realm-export.json
```

Expected: shows `"realm": "cvdlink"`, `"displayName": "CVDLINK"`, `"clientId": "python-api"`, and **no** `"clientId": "node-api"` line.

- [ ] **Step 4: Commit**

```bash
git add realm-export.json
git commit -m "Rename realm playground -> cvdlink and client node-api -> python-api"
```

---

## Task 3: Create the Python API resource server

**Files:**
- Create: `examples/python-api/server.py`
- Create: `examples/python-api/requirements.txt`
- Create: `examples/python-api/.env.example`
- Create: `examples/python-api/README.md`

- [ ] **Step 1: Create `examples/python-api/requirements.txt`**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
pyjwt[crypto]==2.10.1
python-dotenv==1.0.1
```

- [ ] **Step 2: Create `examples/python-api/.env.example`**

```
PORT=3001
KC_ISSUER=http://localhost:8081/realms/cvdlink
KC_JWKS_URI=http://localhost:8081/realms/cvdlink/protocol/openid-connect/certs
```

- [ ] **Step 3: Create `examples/python-api/server.py`**

```python
import os

import jwt
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient

load_dotenv()

PORT = int(os.environ.get("PORT", "3001"))
KC_ISSUER = os.environ.get("KC_ISSUER", "http://localhost:8081/realms/cvdlink")
KC_JWKS_URI = os.environ.get("KC_JWKS_URI", f"{KC_ISSUER}/protocol/openid-connect/certs")

jwks_client = PyJWKClient(KC_JWKS_URI)


def verify(token: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        issuer=KC_ISSUER,
        # audience="python-api",  # enable once you've added an Audience mapper in Keycloak
        options={"verify_aud": False},
    )


def require_auth(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"error": "missing bearer token"})
    token = authorization[len("Bearer "):]
    try:
        return verify(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail={"error": "invalid token", "detail": str(exc)})


def require_role(role: str):
    def _checker(user: dict = Depends(require_auth)) -> dict:
        roles = (user.get("realm_access") or {}).get("roles") or []
        if role not in roles:
            raise HTTPException(status_code=403, detail={"error": f"requires role: {role}"})
        return user
    return _checker


app = FastAPI(title="CVDLINK Playground — Python API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/public")
def public():
    return {"message": "anyone can read this"}


@app.get("/protected")
def protected(user: dict = Depends(require_auth)):
    return {
        "message": "you are authenticated",
        "sub": user.get("sub"),
        "preferred_username": user.get("preferred_username"),
        "roles": (user.get("realm_access") or {}).get("roles", []),
    }


@app.get("/admin")
def admin(user: dict = Depends(require_role("admin"))):
    return {
        "message": "you are an admin",
        "user": user.get("preferred_username"),
    }


if __name__ == "__main__":
    print(f"API listening on http://localhost:{PORT}")
    print(f"Verifying JWTs from: {KC_ISSUER}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT)
```

- [ ] **Step 4: Create `examples/python-api/README.md`**

````markdown
# Python API — Resource Server

Minimal FastAPI service that verifies Keycloak-issued JWTs against the realm's JWKS endpoint.

## Routes

| Path         | Auth                | Returns                                |
|--------------|---------------------|----------------------------------------|
| `/public`    | none                | open to everyone                       |
| `/protected` | valid JWT           | user info from token                   |
| `/admin`     | JWT + `admin` role  | admin-only payload, otherwise 403      |

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn server:app --port 3001
```

Server listens on `http://localhost:3001`. Interactive OpenAPI docs at `http://localhost:3001/docs`.

## Try it

**Get a token via client credentials:**

```bash
TOKEN=$(curl -s -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=python-api \
  -d client_secret=python-api-secret-change-me | jq -r .access_token)
```

**Call the API:**

```bash
curl http://localhost:3001/public
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/protected
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/admin   # 403 — service account has no admin role
```

To hit `/admin`, get a token for the `admin` user via the CVDLINK Login Sample (Auth Code + PKCE).

## How it validates tokens

1. Reads the `Authorization: Bearer <jwt>` header.
2. Uses `PyJWKClient` to fetch + cache Keycloak's public keys from `/realms/cvdlink/protocol/openid-connect/certs`. The client refreshes the JWKS automatically on `kid` cache-miss.
3. Verifies signature (RS256), `iss`, and `exp` via `jwt.decode(..., issuer=KC_ISSUER)`.
4. Optional: `aud` validation. Disabled by default — Keycloak doesn't add your client ID to `aud` unless you add an Audience mapper. See `docs/03-oidc-flow.md` §3.3.
5. Role check: reads `realm_access.roles` from the payload.
````

- [ ] **Step 5: Verify Python imports parse**

```bash
python3 -c "import ast; ast.parse(open('examples/python-api/server.py').read())" && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add examples/python-api
git commit -m "Add python-api FastAPI resource server"
```

---

## Task 4: Create the SPA static-file server and point the SPA at the new realm

**Files:**
- Create: `examples/cvdlink-login-sample/server.py`
- Create: `examples/cvdlink-login-sample/requirements.txt`
- Modify: `examples/cvdlink-login-sample/app.js` (line 5 — `authority` URL)
- Modify: `examples/cvdlink-login-sample/README.md` (run command)

- [ ] **Step 1: Create `examples/cvdlink-login-sample/requirements.txt`**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
```

- [ ] **Step 2: Create `examples/cvdlink-login-sample/server.py`**

```python
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

PORT = int(os.environ.get("PORT", "5173"))
HERE = Path(__file__).resolve().parent

app = FastAPI(title="CVDLINK Login Sample")
app.mount("/", StaticFiles(directory=str(HERE), html=True), name="static")


if __name__ == "__main__":
    print(f"CVDLINK Login Sample listening on http://localhost:{PORT}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT)
```

> Note: `html=True` makes the mount serve `index.html` at `/`. The OIDC redirect lands on `/?code=...&state=...`, which still resolves to `index.html`, so `app.js` can read the query string.

- [ ] **Step 3: Update the SPA's `authority` to the renamed realm**

Modify `examples/cvdlink-login-sample/app.js` line 5. Replace:

```js
  authority: "http://localhost:8081/realms/playground",
```

with:

```js
  authority: "http://localhost:8081/realms/cvdlink",
```

- [ ] **Step 4: Rewrite `examples/cvdlink-login-sample/README.md`**

Replace the file contents with:

````markdown
# CVDLINK Login Sample — Auth Code + PKCE

Vanilla HTML + JS demonstrating the Authorization Code + PKCE flow against Keycloak. No framework, no library — every step is in `app.js`.

## What it does

1. Generates a `code_verifier` (random) and `code_challenge` = `SHA256(verifier)`.
2. Redirects to Keycloak `/auth` with the challenge + a CSRF-protective `state`.
3. On callback, validates `state`, then POSTs the auth code + `code_verifier` to `/token`.
4. Stores the access token in `sessionStorage`, decodes its claims, displays them.
5. Calls the Python API with `Authorization: Bearer <access_token>`.
6. Logout redirects to Keycloak's `end_session_endpoint`.

## Run

A small FastAPI app serves the static files on port `5173` (matches the realm's redirect URI):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --port 5173
```

Then open http://localhost:5173.

> ⚠️ Use `http://localhost:5173` (not `127.0.0.1`) — the realm's redirect URI is registered for `localhost`.

## Try it

1. Click **Login** → Keycloak login form → use `researcher` / `researcher123` (or `admin` / `admin123`).
2. After redirect back, you'll see decoded JWT claims.
3. **GET /public** works without a token.
4. **GET /protected** works for both users.
5. **GET /admin** works only for `admin` (has `admin` realm role); `researcher` gets 403.

## Security notes (for production)

- `sessionStorage` is fine for **this demo** but is XSS-readable. For real apps, the modern recommendation is the **BFF pattern**: tokens live server-side in an `httpOnly` cookie session, browser never sees them.
- The PKCE `code_verifier` is single-use and short-lived; sessionStorage is acceptable here because it's discarded on token exchange.
- Always validate `state` on callback (this code does).
- Use HTTPS in production. Public clients on plain HTTP only work because Keycloak is in dev mode.
````

- [ ] **Step 5: Verify the SPA's authority changed**

```bash
grep -n 'authority' examples/cvdlink-login-sample/app.js
```

Expected output: `5:  authority: "http://localhost:8081/realms/cvdlink",`

- [ ] **Step 6: Commit**

```bash
git add examples/cvdlink-login-sample
git commit -m "Add FastAPI SPA server, point sample at cvdlink realm"
```

---

## Task 5: Update the top-level `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Apply targeted edits to `README.md`**

Make the following exact-string replacements (using Edit; no `replace_all` since each is unique). Each shows `old_string` → `new_string`.

**Edit 5a — Repo description sentence stays the same. Skip.**

**Edit 5b — Auto-imported realm bullet (line 20):** unchanged content; the link target stays `realm-export.json`. Skip.

**Edit 5c — Two runnable examples (lines 22–24):**

Replace:
```
- **Two runnable examples** that talk to it:
  - [`examples/cvdlink-login-sample`](examples/cvdlink-login-sample/) — vanilla JS Authorization Code + PKCE flow
  - [`examples/node-api`](examples/node-api/) — Express resource server validating JWTs via JWKS
```
With:
```
- **Two runnable examples** that talk to it:
  - [`examples/cvdlink-login-sample`](examples/cvdlink-login-sample/) — vanilla JS Authorization Code + PKCE flow, served by FastAPI
  - [`examples/python-api`](examples/python-api/) — FastAPI resource server validating JWTs via JWKS
```

**Edit 5d — Quickstart commands (lines 36–43):**

Replace:
````
# 3. run the API
cd examples/node-api && cp .env.example .env && npm install && npm start
#    listening on :3001

# 4. in another terminal, serve the CVDLINK Login Sample
cd examples/cvdlink-login-sample && python3 -m http.server 5173
#    open http://localhost:5173 → click Login → researcher / researcher123
````
With:
````
# 3. run the API
cd examples/python-api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn server:app --port 3001
#    listening on :3001

# 4. in another terminal, serve the CVDLINK Login Sample
cd examples/cvdlink-login-sample
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --port 5173
#    open http://localhost:5173 → click Login → researcher / researcher123
````

**Edit 5e — Repo layout (lines 73–75):**

Replace:
```
└── examples/
    ├── cvdlink-login-sample/        # vanilla JS PKCE login flow
    └── node-api/                    # Express + jose JWT validation
```
With:
```
└── examples/
    ├── cvdlink-login-sample/        # vanilla JS PKCE login flow, FastAPI static server
    └── python-api/                  # FastAPI + PyJWT JWT validation
```

**Edit 5f — Default credentials table (line 94):**

Replace:
```
| `node-api` secret  | —            | `node-api-secret-change-me`  | service account  |
```
With:
```
| `python-api` secret  | —            | `python-api-secret-change-me`  | service account  |
```

**Edit 5g — Documentation list bullet (line 139):**

Replace:
```
4. [`examples/node-api/README.md`](examples/node-api/README.md) — resource server walkthrough
```
With:
```
4. [`examples/python-api/README.md`](examples/python-api/README.md) — resource server walkthrough
```

- [ ] **Step 2: Verify no `playground` or `node-api` references remain in the README**

```bash
grep -nE 'playground|node-api' README.md && echo "FOUND — fix above" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README: rename playground -> cvdlink, node-api -> python-api"
```

---

## Task 6: Update `docs/01-installation.md`

**Files:**
- Modify: `docs/01-installation.md`

- [ ] **Step 1: Apply edits to `docs/01-installation.md`**

**Edit 6a — Realm-import paragraph (line 27):** the file already says "the realm-export.json is auto-imported on first boot". No change needed.

**Edit 6b — Section 1.2 closing (line 61):**

Replace:
```
After login you land on the **master** realm. Switch to the imported `playground` realm via the realm dropdown in the top-left.
```
With:
```
After login you land on the **master** realm. Switch to the imported `cvdlink` realm via the realm dropdown in the top-left.
```

**Edit 6c — Realm dropdown screenshot caption (line 65):**

Replace:
```
> 📸 **Screenshot to capture:** the realm dropdown opened, showing both `master` and `playground`.
```
With:
```
> 📸 **Screenshot to capture:** the realm dropdown opened, showing both `master` and `cvdlink`.
```

**Edit 6d — Section 1.3 opening + clients line (lines 71–73):**

Replace:
```
In the `playground` realm, confirm the following resources exist:

- **Clients** → `spa-client` (public, PKCE) and `node-api` (confidential, service account)
```
With:
```
In the `cvdlink` realm, confirm the following resources exist:

- **Clients** → `spa-client` (public, PKCE) and `python-api` (confidential, service account)
```

**Edit 6e — Clients-list screenshot caption (line 79):**

Replace:
```
> 📸 **Screenshot to capture:** Clients page showing `spa-client` and `node-api`.
```
With:
```
> 📸 **Screenshot to capture:** Clients page showing `spa-client` and `python-api`.
```

**Edit 6f — Section 1.4 OIDC discovery URL line (line 92) and curl command (line 96):**

Replace:
```
http://localhost:8081/realms/playground/.well-known/openid-configuration
```
With:
```
http://localhost:8081/realms/cvdlink/.well-known/openid-configuration
```

Replace:
```
curl -s http://localhost:8081/realms/playground/.well-known/openid-configuration | jq .
```
With:
```
curl -s http://localhost:8081/realms/cvdlink/.well-known/openid-configuration | jq .
```

**Edit 6g — Endpoints table (lines 103–108):**

Replace the entire table block:
```
| Endpoint              | URL                                                                                |
|-----------------------|------------------------------------------------------------------------------------|
| `authorization`       | `http://localhost:8081/realms/playground/protocol/openid-connect/auth`             |
| `token`               | `http://localhost:8081/realms/playground/protocol/openid-connect/token`            |
| `userinfo`            | `http://localhost:8081/realms/playground/protocol/openid-connect/userinfo`         |
| `jwks_uri`            | `http://localhost:8081/realms/playground/protocol/openid-connect/certs`            |
| `end_session_endpoint`| `http://localhost:8081/realms/playground/protocol/openid-connect/logout`           |
| `issuer`              | `http://localhost:8081/realms/playground`                                          |
```
With:
```
| Endpoint              | URL                                                                                |
|-----------------------|------------------------------------------------------------------------------------|
| `authorization`       | `http://localhost:8081/realms/cvdlink/protocol/openid-connect/auth`                |
| `token`               | `http://localhost:8081/realms/cvdlink/protocol/openid-connect/token`               |
| `userinfo`            | `http://localhost:8081/realms/cvdlink/protocol/openid-connect/userinfo`            |
| `jwks_uri`            | `http://localhost:8081/realms/cvdlink/protocol/openid-connect/certs`               |
| `end_session_endpoint`| `http://localhost:8081/realms/cvdlink/protocol/openid-connect/logout`              |
| `issuer`              | `http://localhost:8081/realms/cvdlink`                                             |
```

- [ ] **Step 2: Verify no `playground` or `node-api` references remain**

```bash
grep -nE 'playground|node-api' docs/01-installation.md && echo "FOUND — fix above" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/01-installation.md
git commit -m "docs/01: rename playground -> cvdlink, node-api -> python-api"
```

---

## Task 7: Update `docs/02-realm-setup.md`

**Files:**
- Modify: `docs/02-realm-setup.md`

- [ ] **Step 1: Apply edits to `docs/02-realm-setup.md`**

**Edit 7a — Section 2.1 step 2 (line 13):**

Replace:
```
2. **Realm name:** `playground`. Leave the rest at defaults.
```
With:
```
2. **Realm name:** `cvdlink`. **Display name:** `CVDLINK`. Leave the rest at defaults.
```

**Edit 7b — Section 2.4 heading and steps (lines 67–84):**

Replace:
```
## 2.4 Create the API client (confidential, service account)

This client represents a backend service that needs to obtain its own tokens (e.g., for calling another service or for service-to-service auth).

1. **Clients** → **Create client**.
2. **General settings:**
   - Client ID: `node-api`
   - **Next**
3. **Capability config:**
   - Client authentication: **ON** (confidential)
   - Authentication flow: ✅ Service accounts roles only (uncheck Standard flow + Direct access grants)
   - **Next**
4. **Login settings:** leave blank → **Save**.

![Node API capability config](images/14-api-capability.png)

> 📸 **Screenshot to capture:** the Node API client's Capability config tab.

5. After save → **Credentials** tab → copy the **Client secret**. You'll paste it into the Node API's `.env`.
```
With:
```
## 2.4 Create the API client (confidential, service account)

This client represents a backend service that needs to obtain its own tokens (e.g., for calling another service or for service-to-service auth).

1. **Clients** → **Create client**.
2. **General settings:**
   - Client ID: `python-api`
   - **Next**
3. **Capability config:**
   - Client authentication: **ON** (confidential)
   - Authentication flow: ✅ Service accounts roles only (uncheck Standard flow + Direct access grants)
   - **Next**
4. **Login settings:** leave blank → **Save**.

![Python API capability config](images/14-api-capability.png)

> 📸 **Screenshot to capture:** the Python API client's Capability config tab.

5. After save → **Credentials** tab → copy the **Client secret**. You'll paste it into the Python API's `.env`.
```

**Edit 7c — Section 2.6 last paragraph (line 114):**

Replace:
```
For most apps, the default `realm_access.roles` is fine — your resource server reads it directly (see Node API example).
```
With:
```
For most apps, the default `realm_access.roles` is fine — your resource server reads it directly (see Python API example).
```

**Edit 7d — Section 2.7 curl example (line 123):**

Replace:
```
curl -X POST http://localhost:8081/realms/playground/protocol/openid-connect/token \
```
With:
```
curl -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token \
```

- [ ] **Step 2: Verify no `playground` or `node-api` (or "Node API") references remain**

```bash
grep -nEi 'playground|node[- ]api' docs/02-realm-setup.md && echo "FOUND — fix above" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/02-realm-setup.md
git commit -m "docs/02: rename playground -> cvdlink, Node API -> Python API"
```

---

## Task 8: Update `docs/03-oidc-flow.md`

**Files:**
- Modify: `docs/03-oidc-flow.md`

- [ ] **Step 1: Apply edits to `docs/03-oidc-flow.md`**

**Edit 8a — Section 3.1 sequence-diagram participant (line 20):**

Replace:
```
    participant API as Resource Server (Node API)
```
With:
```
    participant API as Resource Server (Python API)
```

**Edit 8b — Section 3.1 endpoints block (lines 49–51):**

Replace:
```
authorize: http://localhost:8081/realms/playground/protocol/openid-connect/auth
token:     http://localhost:8081/realms/playground/protocol/openid-connect/token
logout:    http://localhost:8081/realms/playground/protocol/openid-connect/logout
```
With:
```
authorize: http://localhost:8081/realms/cvdlink/protocol/openid-connect/auth
token:     http://localhost:8081/realms/cvdlink/protocol/openid-connect/token
logout:    http://localhost:8081/realms/cvdlink/protocol/openid-connect/logout
```

**Edit 8c — Walkthrough setup line (line 60):**

Replace:
```
The screenshots below were captured against the local stack (`docker compose up -d`, sample on `:5173`, Node API on `:3001`). The realm has two demo users: `researcher`/`researcher123` with role `user`, and `admin`/`admin123` with roles `user` + `admin`.
```
With:
```
The screenshots below were captured against the local stack (`docker compose up -d`, sample on `:5173`, Python API on `:3001`). The realm has two demo users: `researcher`/`researcher123` with role `user`, and `admin`/`admin123` with roles `user` + `admin`.
```

**Edit 8d — Walkthrough step 4 caption (line 74):**

Replace:
```
**4. `GET /protected` as `researcher` → 200** — the Node API verified the JWT against the realm's JWKS and returned the bearer's identity and roles.
```
With:
```
**4. `GET /protected` as `researcher` → 200** — the Python API verified the JWT against the realm's JWKS and returned the bearer's identity and roles.
```

**Edit 8e — Section 3.2 sequence-diagram message (line 97):**

Replace:
```
    Svc->>KC: POST /token<br/>grant_type=client_credentials,<br/>client_id=node-api, client_secret=...
```
With:
```
    Svc->>KC: POST /token<br/>grant_type=client_credentials,<br/>client_id=python-api, client_secret=...
```

**Edit 8f — Section 3.2 try-it curl (lines 109–112):**

Replace:
```
curl -X POST http://localhost:8081/realms/playground/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=node-api" \
  -d "client_secret=node-api-secret-change-me" | jq .
```
With:
```
curl -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=python-api" \
  -d "client_secret=python-api-secret-change-me" | jq .
```

**Edit 8g — Section 3.3 sample payload `iss` (line 160):**

Replace:
```
  "iss": "http://localhost:8081/realms/playground",
```
With:
```
  "iss": "http://localhost:8081/realms/cvdlink",
```

**Edit 8h — Section 3.3 sample payload `realm_access` (line 167):**

Replace:
```
    "roles": ["user", "default-roles-playground", "offline_access"]
```
With:
```
    "roles": ["user", "default-roles-cvdlink", "offline_access"]
```

**Edit 8i — Section 3.3 audience-mapper paragraph (line 188):**

Replace:
```
> ⚠️ **`aud` gotcha:** by default Keycloak doesn't add your API's client ID to `aud`. If you want strict audience validation in the resource server, add an **Audience** mapper to the client scope. The Node API example sets `audience: false` to keep things simple — read the comments.
```
With:
```
> ⚠️ **`aud` gotcha:** by default Keycloak doesn't add your API's client ID to `aud`. If you want strict audience validation in the resource server, add an **Audience** mapper to the client scope. The Python API example passes `options={"verify_aud": False}` to `jwt.decode` to keep things simple — read the comments.
```

**Edit 8j — Section 3.3 signature-verification paragraph (line 192):**

Replace:
```
The resource server fetches **public keys** from `/realms/playground/protocol/openid-connect/certs` (JWKS) and verifies the signature. Keys rotate, so cache with a TTL and refresh on `kid` miss.
```
With:
```
The resource server fetches **public keys** from `/realms/cvdlink/protocol/openid-connect/certs` (JWKS) and verifies the signature. Keys rotate, so cache with a TTL and refresh on `kid` miss.
```

**Edit 8k — Section 3.4 refresh-token curl (line 216):**

Replace:
```
curl -X POST http://localhost:8081/realms/playground/protocol/openid-connect/token \
```
With:
```
curl -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token \
```

**Edit 8l — Section 3.5 logout URL block (line 233):**

Replace:
```
GET http://localhost:8081/realms/playground/protocol/openid-connect/logout
```
With:
```
GET http://localhost:8081/realms/cvdlink/protocol/openid-connect/logout
```

**Edit 8m — Closing "Next" line (line 245):**

Replace:
```
**Next:** [`../examples/cvdlink-login-sample`](../examples/cvdlink-login-sample) and [`../examples/node-api`](../examples/node-api) — runnable code that implements everything above.
```
With:
```
**Next:** [`../examples/cvdlink-login-sample`](../examples/cvdlink-login-sample) and [`../examples/python-api`](../examples/python-api) — runnable code that implements everything above.
```

- [ ] **Step 2: Verify no `playground` or `node-api` (or "Node API") references remain**

```bash
grep -nEi 'playground|node[- ]api' docs/03-oidc-flow.md && echo "FOUND — fix above" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/03-oidc-flow.md
git commit -m "docs/03: rename playground -> cvdlink, Node API -> Python API"
```

---

## Task 9: Repo-wide sweep — confirm no stale references remain

**Files:** read-only verification.

- [ ] **Step 1: Search the whole tree for `playground` references**

```bash
grep -rnE 'playground' --include='*.md' --include='*.json' --include='*.js' --include='*.py' --include='*.yml' --include='*.yaml' .
```

Expected: only matches inside `docs/superpowers/` (the spec/plan files referencing the rename history) — no other hits. If any operational file still mentions `playground`, fix it before proceeding.

- [ ] **Step 2: Search the whole tree for `node-api` references**

```bash
grep -rnE 'node-api' --include='*.md' --include='*.json' --include='*.js' --include='*.py' --include='*.yml' --include='*.yaml' .
```

Expected: only matches inside `docs/superpowers/` — no operational hits.

- [ ] **Step 3: If grep finds anything else, fix it now and commit a follow-up**

If something turns up:

```bash
git add <fixed-files>
git commit -m "Sweep: remove remaining playground/node-api references"
```

If everything is clean: nothing to commit. Move on.

---

## Task 10: Bring up the stack and smoke-test end-to-end

**Files:** none modified — runtime verification only.

- [ ] **Step 1: Drop and reimport the realm**

```bash
docker compose down -v
docker compose up -d
```

Wait ~30s for Keycloak to import the renamed realm.

- [ ] **Step 2: Confirm Keycloak is up and the realm reimported**

```bash
until curl -fs http://localhost:8081/realms/cvdlink/.well-known/openid-configuration > /dev/null; do sleep 2; done
curl -s http://localhost:8081/realms/cvdlink/.well-known/openid-configuration | python3 -c "import json, sys; d = json.load(sys.stdin); print('issuer:', d['issuer'])"
```

Expected: `issuer: http://localhost:8081/realms/cvdlink`.

- [ ] **Step 3: Boot the Python API**

In one terminal:

```bash
cd examples/python-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.example .env
uvicorn server:app --port 3001
```

Expected log line: `Uvicorn running on http://0.0.0.0:3001`.

- [ ] **Step 4: Hit `/public` (no token)**

In a third terminal:

```bash
curl -s http://localhost:3001/public
```

Expected: `{"message":"anyone can read this"}`.

- [ ] **Step 5: Get a service-account token and hit `/protected`**

```bash
TOKEN=$(curl -s -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=python-api \
  -d client_secret=python-api-secret-change-me | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/protected | python3 -m json.tool
```

Expected: a JSON body with `"message": "you are authenticated"` and `"preferred_username": "service-account-python-api"`.

- [ ] **Step 6: Confirm `/admin` refuses the service account**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:3001/admin
```

Expected: `403`.

- [ ] **Step 7: Boot the SPA server**

In a second terminal:

```bash
cd examples/cvdlink-login-sample
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --port 5173
```

- [ ] **Step 8: Confirm the SPA loads**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

Expected: `200`.

- [ ] **Step 9: Manual browser smoke test**

Open `http://localhost:5173` in a browser:

1. Click **Login**, sign in as `researcher` / `researcher123`. Page returns and shows decoded claims; `iss` field reads `http://localhost:8081/realms/cvdlink`. Status text reads `logged in as researcher`.
2. Click **GET /protected**. Response shows `status: 200` with `"preferred_username": "researcher"`.
3. Click **GET /admin**. Response shows `status: 403`.
4. Click **Logout**, then log back in as `admin` / `admin123`.
5. Click **GET /admin**. Response shows `status: 200` with `"user": "admin"`.

If any step fails, fix the underlying issue (in code or realm export) and re-run from Step 1.

- [ ] **Step 10: Leave both services running** for Task 11 (screenshot capture).

---

## Task 11: Recapture `docs/images/03-spa-post-login-claims.png` via Playwright

**Files:**
- Modify: `docs/images/03-spa-post-login-claims.png` (binary replacement)

**Prereq:** Task 10 finished — Keycloak, Python API, and SPA server are all running.

- [ ] **Step 1: Set up a one-shot Playwright environment in `/tmp`**

```bash
cd /tmp
python3 -m venv playwright-shot
source playwright-shot/bin/activate
pip install playwright
python -m playwright install chromium
```

- [ ] **Step 2: Write the capture script**

Create `/tmp/capture.py`:

```python
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(sys.argv[1])
OUT = REPO / "docs" / "images" / "03-spa-post-login-claims.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1024, "height": 900})
    page = context.new_page()

    page.goto("http://localhost:5173/", wait_until="networkidle")
    page.click("#login")
    page.wait_for_url("**/realms/cvdlink/protocol/openid-connect/auth*")
    page.fill("input[name=username]", "researcher")
    page.fill("input[name=password]", "researcher123")
    page.click("input[type=submit], button[type=submit]")

    page.wait_for_url("http://localhost:5173/", timeout=15000)
    page.wait_for_function(
        "document.getElementById('claims').textContent.includes('preferred_username')",
        timeout=15000,
    )

    page.screenshot(path=str(OUT), full_page=True)
    print(f"saved -> {OUT}")
    browser.close()
```

- [ ] **Step 3: Run the script against the running stack**

```bash
python /tmp/capture.py /Users/rytis/src/keyclock_playground
```

Expected output: `saved -> /Users/rytis/src/keyclock_playground/docs/images/03-spa-post-login-claims.png`.

- [ ] **Step 4: Sanity-check the image**

```bash
file docs/images/03-spa-post-login-claims.png
```

Expected: `... PNG image data, ...` and a non-zero file size.

Open the image and confirm:
- Decoded JWT panel is visible.
- `iss` claim reads `http://localhost:8081/realms/cvdlink`.
- `preferred_username` reads `researcher`.

If the screenshot doesn't match, re-run from Task 10 Step 9 (the SPA may need a fresh login) and rerun the script.

- [ ] **Step 5: Discard the temp Playwright environment**

```bash
deactivate || true
rm -rf /tmp/playwright-shot /tmp/capture.py
```

- [ ] **Step 6: Commit the new screenshot**

```bash
cd /Users/rytis/src/keyclock_playground
git add docs/images/03-spa-post-login-claims.png
git commit -m "docs: recapture post-login claims screenshot for cvdlink realm"
```

- [ ] **Step 7: (Cleanup) Stop the stack if you don't need it running**

```bash
docker compose down
```

Stop the two `uvicorn` processes with Ctrl-C in their terminals.

---

## Done

- `examples/python-api/` exists, replaces `examples/node-api/`.
- `examples/cvdlink-login-sample/server.py` serves the SPA via FastAPI; `app.js` points at the renamed realm.
- `realm-export.json` defines a realm `cvdlink` with displayName `CVDLINK` and a client `python-api`.
- `README.md` and `docs/0[1-3]-*.md` reference `cvdlink` and `python-api` everywhere.
- `docs/images/03-spa-post-login-claims.png` shows the `cvdlink` issuer in the decoded JWT.
- The whole flow (login as `researcher`, login as `admin`, `/public`, `/protected`, `/admin`) was smoke-tested end-to-end in Task 10.

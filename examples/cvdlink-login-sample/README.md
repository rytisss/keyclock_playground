# CVDLINK Login Sample — Auth Code + PKCE

HTML + JS demonstrating the Authorization Code + PKCE flow against Keycloak — every step is in `app.js`.

## Abbreviations

Terms used in this README. Full glossary in
[`../../docs/04-ldap.md` §4.1](../../docs/04-ldap.md#41-abbreviations).

| Short | Long                            | Used here for |
|-------|---------------------------------|----------------|
| PKCE  | Proof Key for Code Exchange     | The flow this sample implements. |
| JWT   | JSON Web Token                  | The token decoded after login. |
| CSRF  | Cross-Site Request Forgery      | What the `state` parameter mitigates. |
| BFF   | Backend-for-Frontend            | Production alternative to storing tokens in `sessionStorage`. |
| XSS   | Cross-Site Scripting            | The threat `BFF` defends against. |
| SPA   | Single-Page Application         | This sample. |
| HTTPS | HTTP over TLS                   | Required in production. |
| API   | Application Programming Interface | The Python API the sample calls. |

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
5. **GET /admin** works only for `admin` (who holds `cvdlink-admin` along with the other three CVDLINK roles); `researcher` gets 403.

## Security notes (for production)

- `sessionStorage` is fine for **this demo** but is XSS-readable. For real apps, the modern recommendation is the **BFF pattern**: tokens live server-side in an `httpOnly` cookie session, browser never sees them.
- The PKCE `code_verifier` is single-use and short-lived; sessionStorage is acceptable here because it's discarded on token exchange.
- Always validate `state` on callback (this code does).
- Use HTTPS in production. Public clients on plain HTTP only work because Keycloak is in dev mode.

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

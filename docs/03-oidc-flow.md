# 3. OIDC Auth Flows

Two flows are covered:

- **Authorization Code + PKCE** — for any user-facing app (browser, mobile, native, server-rendered web).
- **Client Credentials** — for service-to-service (no user involved).

This page explains both, shows the wire-level requests, and decodes a real JWT.

---

## 3.1 Authorization Code + PKCE

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant App as App (browser)
    participant KC as Keycloak
    participant API as Resource Server (Python API)

    U->>App: Click "Login"
    App->>App: Generate code_verifier (random 43-128 chars)
    App->>App: code_challenge = SHA256(code_verifier), base64url
    App->>KC: 302 → /auth?response_type=code&client_id=cvdlink-user&<br/>redirect_uri=...&code_challenge=...&code_challenge_method=S256&state=...
    KC->>U: Login form
    U->>KC: username + password
    KC->>App: 302 → redirect_uri?code=AUTH_CODE&state=...
    App->>KC: POST /token<br/>grant_type=authorization_code, code=AUTH_CODE,<br/>code_verifier=..., client_id=cvdlink-user, redirect_uri=...
    KC->>KC: Verify SHA256(code_verifier) == code_challenge
    KC->>App: { access_token (JWT), id_token (JWT), refresh_token, expires_in }
    App->>API: GET /protected<br/>Authorization: Bearer <access_token>
    API->>KC: GET /certs (cached, JWKS)
    API->>API: Verify JWT signature, exp, iss, aud
    API->>App: 200 { ... }
```

### Why PKCE?

The authorization code is sent through the browser address bar (a redirect). If an attacker grabs it (malicious browser extension, network MITM on a non-HTTPS link, etc.), they could trade it for tokens at the token endpoint.

**PKCE** binds the code to the originating client by requiring the same `code_verifier` that was hashed into `code_challenge` during the auth request. The attacker has the code but not the verifier, so the token exchange fails.

Always use `S256`, never `plain`.

### Endpoints used

```
authorize: http://localhost:8081/realms/cvdlink/protocol/openid-connect/auth
token:     http://localhost:8081/realms/cvdlink/protocol/openid-connect/token
logout:    http://localhost:8081/realms/cvdlink/protocol/openid-connect/logout
```

### Working code

See [`examples/cvdlink-login-sample`](../examples/cvdlink-login-sample). It's ~150 lines so you can read every step.

### Walkthrough

The screenshots below were captured against the local stack (`docker compose up -d`, sample on `:5173`, Python API on `:3001`). The realm has two demo users: `researcher`/`researcher123` with role `user`, and `admin`/`admin123` with roles `user` + `admin`.

**1. Sample app before login** — no token in `sessionStorage`, the API panel is empty.

![Login sample pre-login](images/01-app-pre-login.png)

**2. Keycloak login form** — clicking *Login* redirects to the realm's `/auth` endpoint with `code_challenge` + `state` in the query string. The login page uses the custom `cvdlink` theme that swaps the realm-name banner for the CVDLINK logo.

![Keycloak login form](images/02-keycloak-login.png)

**3. Post-login: decoded access token** — after the redirect back, the sample app exchanged the code (with `code_verifier`) for tokens and decoded the JWT. Note `iss`, `azp=cvdlink-user`, `realm_access.roles=["user"]`.

![Decoded JWT after login](images/03-app-post-login-claims.png)

**4. `GET /protected` as `researcher` → 200** — the Python API verified the JWT against the realm's JWKS and returned the bearer's identity and roles.

![/protected returns 200 for researcher](images/04-app-protected-200.png)

**5. `GET /admin` as `researcher` → 403** — `requireRole("admin")` rejected the request because the token's `realm_access.roles` does not include `admin`.

![/admin returns 403 for researcher](images/05-app-admin-403-researcher.png)

**6. `GET /admin` as `admin` → 200** — after logging out and back in as `admin`, the same endpoint succeeds because the new token carries the `admin` realm role.

![/admin returns 200 for admin](images/06-app-admin-200-admin.png)

---

## 3.2 Client Credentials

```mermaid
sequenceDiagram
    autonumber
    participant Svc as Backend Service
    participant KC as Keycloak
    participant API as Other API

    Svc->>KC: POST /token<br/>grant_type=client_credentials,<br/>client_id=python-api, client_secret=...
    KC->>Svc: { access_token (JWT), expires_in: 300 }
    Svc->>API: GET /resource<br/>Authorization: Bearer <access_token>
    API->>API: Verify JWT (JWKS, exp, iss, aud)
    API->>Svc: 200 { ... }
```

No user, no browser, no redirect. The service authenticates with its own credentials.

### Try it

```bash
curl -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=python-api" \
  -d "client_secret=python-api-secret-change-me" | jq .
```

Output:

```json
{
  "access_token": "eyJhbGciOi...",
  "expires_in": 300,
  "token_type": "Bearer",
  "not-before-policy": 0,
  "scope": "email profile"
}
```

### When to use it

- Cron job → API
- Microservice A → Microservice B (where neither acts on behalf of a specific user)
- CI/CD calling deployment APIs

Do **not** use client credentials in a browser app — there is nowhere to safely store the secret.

---

## 3.3 The JWT itself

A Keycloak access token is a signed JWT: `header.payload.signature`, base64url-encoded.

### Header

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "abc123..."
}
```

`kid` = key ID. The resource server uses it to look up the right public key from the JWKS endpoint.

### Payload (claims)

```json
{
  "exp": 1735689600,
  "iat": 1735689300,
  "jti": "...",
  "iss": "http://localhost:8081/realms/cvdlink",
  "aud": "account",
  "sub": "8a7d...",
  "typ": "Bearer",
  "azp": "cvdlink-user",
  "session_state": "...",
  "realm_access": {
    "roles": ["user", "default-roles-cvdlink", "offline_access"]
  },
  "resource_access": {
    "account": { "roles": ["manage-account", "view-profile"] }
  },
  "scope": "openid email profile",
  "email_verified": true,
  "preferred_username": "researcher",
  "email": "researcher@example.com"
}
```

| Claim          | What to check                                                          |
|----------------|------------------------------------------------------------------------|
| `iss`          | Must equal your realm's issuer URL.                                    |
| `aud`          | Must include your API's client ID (or be configured per your mapper).  |
| `exp`          | Must be in the future. Reject expired tokens.                          |
| `azp`          | Authorized party — which client requested the token.                   |
| `realm_access.roles` | Realm roles the user/service has. Use for authz.                 |
| `sub`          | Stable user ID. Use this as your foreign key, not `preferred_username`.|

> ⚠️ **`aud` gotcha:** by default Keycloak doesn't add your API's client ID to `aud`. If you want strict audience validation in the resource server, add an **Audience** mapper to the client scope. The Python API example passes `options={"verify_aud": False}` to `jwt.decode` to keep things simple — read the comments.

### Signature verification

The resource server fetches **public keys** from `/realms/cvdlink/protocol/openid-connect/certs` (JWKS) and verifies the signature. Keys rotate, so cache with a TTL and refresh on `kid` miss.

```mermaid
flowchart LR
    A[Receive request<br/>Authorization: Bearer ...] --> B[Decode JWT header<br/>extract kid]
    B --> C{Key in cache?}
    C -- yes --> E[Verify signature<br/>RS256 with public key]
    C -- no --> D[Fetch JWKS<br/>cache result]
    D --> E
    E --> F{Valid?}
    F -- no --> X[401]
    F -- yes --> G[Validate iss, exp, aud]
    G --> H{Has required role?}
    H -- no --> Y[403]
    H -- yes --> Z[200 + handle request]
```

---

## 3.4 Refresh tokens

The token response includes a `refresh_token`. When `access_token` expires (default: 5 min), the client exchanges the refresh token for a new pair:

```bash
curl -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token \
  -d "grant_type=refresh_token" \
  -d "client_id=cvdlink-user" \
  -d "refresh_token=$REFRESH_TOKEN"
```

For browser apps, refresh tokens live in memory (or `httpOnly` cookies via a BFF). **Never** put them in `localStorage` if you can avoid it — XSS would exfiltrate them.

For service-to-service (client credentials), don't use refresh tokens at all — just request a new token when you need one. Keycloak doesn't issue refresh tokens for client credentials by default.

---

## 3.5 Logout

Frontend logout = redirect the user to the `end_session_endpoint`:

```
GET http://localhost:8081/realms/cvdlink/protocol/openid-connect/logout
    ?client_id=cvdlink-user
    &id_token_hint=<id_token>
    &post_logout_redirect_uri=http://localhost:5173/
```

This kills the Keycloak SSO session.

**Keycloak 26 requires either `id_token_hint` or `client_id`** on the logout request — passing neither returns `Missing parameters: id_token_hint`. With `id_token_hint` the user is logged out silently; with only `client_id`, Keycloak shows a "do you want to sign out?" confirmation page. The CVDLINK Login Sample passes both, so it works in either state.

---

**Next:** [`../examples/cvdlink-login-sample`](../examples/cvdlink-login-sample) and [`../examples/python-api`](../examples/python-api) — runnable code that implements everything above.

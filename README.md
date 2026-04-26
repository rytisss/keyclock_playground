# keyclock_playground

A self-contained Keycloak playground: spin up Keycloak with one command, then walk through OIDC + JWT auth end-to-end with working SPA and API examples.

## What's inside

- **Keycloak 26 + Postgres** via `docker-compose`
- **Auto-imported realm** (`realm-export.json`) with clients, roles, and demo users
- **Two runnable examples** that talk to it:
  - `examples/spa` — vanilla JS Authorization Code + PKCE flow
  - `examples/node-api` — Express resource server validating JWTs via JWKS
- **Step-by-step docs** with Mermaid sequence diagrams and screenshot slots

## Quickstart

```bash
# 1. start Keycloak + Postgres (first start auto-imports the realm)
docker compose up -d

# 2. wait ~30s, then open the admin console
#    http://localhost:8081/admin   (admin / admin)

# 3. run the API
cd examples/node-api && cp .env.example .env && npm install && npm start
#    listening on :3001

# 4. in another terminal, serve the SPA
cd examples/spa && python3 -m http.server 5173
#    open http://localhost:5173 → click Login → demo / demo123
```

## Repo layout

```
.
├── docker-compose.yml       # Keycloak 26 + Postgres
├── realm-export.json        # auto-imported on first boot
├── docs/
│   ├── 01-installation.md   # bring up the stack, first admin login
│   ├── 02-realm-setup.md    # manual click-by-click realm config
│   ├── 03-oidc-flow.md      # Auth Code+PKCE, Client Credentials, JWT internals
│   └── images/              # screenshot slots (capture as you go)
└── examples/
    ├── spa/                 # vanilla JS SPA (PKCE)
    └── node-api/            # Express + jose JWT validation
```

## Auth flows covered

| Flow                       | Used by                  | Doc                              |
|----------------------------|--------------------------|----------------------------------|
| Authorization Code + PKCE  | SPA, mobile, native      | `docs/03-oidc-flow.md` §3.1      |
| Client Credentials         | service-to-service       | `docs/03-oidc-flow.md` §3.2      |
| Refresh Token              | extending sessions       | `docs/03-oidc-flow.md` §3.4      |
| Logout (`end_session`)     | sign-out                 | `docs/03-oidc-flow.md` §3.5      |

## Default credentials

| Who                | Username | Password   | Roles            |
|--------------------|----------|------------|------------------|
| Keycloak admin     | `admin`  | `admin`    | (master realm)   |
| Demo user          | `demo`   | `demo123`  | `user`           |
| Boss user          | `boss`   | `boss123`  | `user`, `admin`  |
| `node-api` secret  | —        | `node-api-secret-change-me` | service account |

> ⚠️ Defaults are for local play only. Do not deploy this stack as-is.

## Documentation order

1. [`docs/01-installation.md`](docs/01-installation.md) — Docker, first admin login, OIDC discovery doc
2. [`docs/02-realm-setup.md`](docs/02-realm-setup.md) — manual realm/client/user setup (skip if you used the import)
3. [`docs/03-oidc-flow.md`](docs/03-oidc-flow.md) — auth flows + JWT structure
4. [`examples/node-api/README.md`](examples/node-api/README.md) — resource server walkthrough
5. [`examples/spa/README.md`](examples/spa/README.md) — SPA walkthrough

## Capturing screenshots

The docs reference `docs/images/NN-<name>.png`. Each screenshot slot is annotated with `> 📸 Screenshot to capture: ...` describing what to grab. Walk through the docs against a live Keycloak instance and save as you go.

## License

MIT (see `LICENSE`).

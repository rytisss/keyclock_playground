# CVDLINK Roles & Visuals — Design

Branch: `feature/cvdlink_roles_visuals`
Date: 2026-05-09

## Goal

Replace the realm's generic `user` / `admin` roles with the four CVDLINK-specific roles:

- CVDLINK Healthcare Professional
- CVDLINK Researcher
- CVDLINK Resource Manager (Systemic Role)
- CVDLINK Admin

Update the sample API, realm import, docs, and demo users to match. Re-capture only the screenshots that the rename invalidates.

## Role model

Realm roles are stored under their **slugs** (what shows up in `realm_access.roles`). The
human-readable name from the deliverable is preserved as the role's `description` so it
surfaces in the Keycloak admin console.

| Slug                              | Description                                |
|-----------------------------------|--------------------------------------------|
| `cvdlink-healthcare-professional` | CVDLINK Healthcare Professional            |
| `cvdlink-researcher`              | CVDLINK Researcher                         |
| `cvdlink-resource-manager`        | CVDLINK Resource Manager (Systemic Role)   |
| `cvdlink-admin`                   | CVDLINK Admin                              |

The pre-existing `user` and `admin` realm roles are removed.

## Demo users

Usernames and passwords are unchanged so the credentials table and screenshots stay
recognisable.

| Username     | Password         | Realm roles                                                                                                                  |
|--------------|------------------|------------------------------------------------------------------------------------------------------------------------------|
| `researcher` | `researcher123`  | `cvdlink-researcher`                                                                                                         |
| `admin`      | `admin123`       | `cvdlink-healthcare-professional`, `cvdlink-researcher`, `cvdlink-resource-manager`, `cvdlink-admin` *(all four — multi-role demo)* |

The multi-role admin user lets the JWT-claims screenshot show every role at once and
keeps the existing 403/200 demo working: `researcher` hits `/admin` → 403,
`admin` hits `/admin` → 200.

## API

`examples/python-api/server.py`: the only change is the role argument to the
`/admin` route gate.

```python
# before
@app.get("/admin")
def admin(user: dict = Depends(require_role("admin"))): ...

# after
@app.get("/admin")
def admin(user: dict = Depends(require_role("cvdlink-admin"))): ...
```

The 403 response body's `requires role: <role>` text will now read
`requires role: cvdlink-admin`, which is the only user-visible diff.

`examples/cvdlink-login-sample/`: no source change — it calls `/admin` by path,
not by role.

## Realm export

In `realm-export.json`:

- `realm.roles.realm`: replace the two-entry list with the four CVDLINK roles
  (`name` = slug, `description` = display string).
- `users[*].realmRoles`: rewrite per the table above.

Everything else (clients, theme, lifespans) stays as-is.

## Documentation

| File | Change |
|------|--------|
| `README.md` | Credentials table updated; `Roles` column shows the new slugs. Screenshot row captions in *Screenshots* unchanged structurally. |
| `docs/02-realm-setup.md` | §2.2 *Create realm roles* lists four CVDLINK roles with descriptions. §2.5 *Create users* assigns the new role mappings. Screenshot references unchanged (filenames are reused). |
| `docs/03-oidc-flow.md` | "the realm has two demo users…" paragraph updated. Walkthrough captions (steps 3, 5, 6) reference `cvdlink-admin` / `cvdlink-researcher` instead of `admin` / `user`. |

## Screenshots

Only the ones the rename invalidates. Filenames are kept (so links don't break);
the PNG content is re-captured.

| File | Why it changes |
|------|----------------|
| `docs/images/11-realm-roles.png` | Realm-roles list now shows four CVDLINK rows. |
| `docs/images/16-user-roles.png` | `admin` user's role mapping shows four assigned roles. |
| `docs/images/04-users-list.png` | Re-shoot for visual freshness (same usernames). |
| `docs/images/03-app-post-login-claims.png` | Decoded JWT shows the new role slugs in `realm_access.roles`. |
| `docs/images/05-app-admin-403-researcher.png` | 403 body now reads `requires role: cvdlink-admin`. |
| `docs/images/06-app-admin-200-admin.png` | Re-shoot for consistency (no semantic change). |

The remaining images (`01-admin-login`, `02-keycloak-login`, `02-realm-selector`,
`03-clients-list`, `10-create-realm`, `12-cvdlink-user-capability`, `13-pkce-s256`,
`14-api-capability`, `15-client-secret`, `01-app-pre-login`, `04-app-protected-200`)
are role-agnostic and stay as-is.

## Capture workflow

The agent cannot drive a browser. Capture is split:

1. **Agent does:** code/config/doc changes, branch creation, `docker compose down -v && docker compose up -d`, starts both Python servers, verifies the 403/200 contract via `curl`, leaves a checklist of screenshot shots to take.
2. **Human does:** opens the URLs from the checklist, captures each screenshot, overwrites the PNG files, then commits.

## Build / verification

After all code changes are in place on the branch:

```powershell
docker compose down -v
docker compose up -d
# wait ~30s for realm import
curl http://localhost:8081/realms/cvdlink/.well-known/openid-configuration | jq .issuer
```

Then, in two terminals:

```powershell
# api
cd examples/python-api ; uvicorn server:app --port 3001
# sample
cd examples/cvdlink-login-sample ; uvicorn server:app --port 5173
```

Smoke test (no browser needed):

```powershell
$tok = (curl -s -X POST http://localhost:8081/realms/cvdlink/protocol/openid-connect/token `
  -d "grant_type=password" -d "client_id=cvdlink-user" `
  -d "username=researcher" -d "password=researcher123") | ConvertFrom-Json
# expect: realm_access.roles contains cvdlink-researcher, /admin returns 403
```

(`grant_type=password` is disabled in the realm; for the smoke test we either use the
sample app via browser or temporarily flip the client's *Direct access grants* on. The
agent will exercise this through the running stack and document the result; it is not
part of the committed change.)

## Out of scope

- No new API endpoints per role.
- No theme changes.
- No realm-export.json schema changes beyond roles + role mappings.
- No backwards compatibility with code that hardcodes `user` / `admin` strings — this is
  a demo project; consumers are inside the repo and all get updated.

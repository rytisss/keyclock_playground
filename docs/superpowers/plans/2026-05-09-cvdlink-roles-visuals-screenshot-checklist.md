# Screenshot Capture Checklist — `feature/cvdlink_roles_visuals`

The branch is already running locally:

- Keycloak admin: <http://localhost:8081/admin> (master `admin` / `admin`)
- Sample app:     <http://localhost:5173/>
- Python API:     <http://localhost:3001/>

Six PNG files need to be re-captured. Filenames stay the same (so doc links don't
break) — overwrite the files at `docs/images/<name>.png`.

The exact size/aspect of the existing PNGs should be preserved where possible
(crop to roughly the same viewport).

| # | File | Where to capture | What it should show |
|---|------|------------------|---------------------|
| 1 | `docs/images/11-realm-roles.png` | Admin Console → Realm `cvdlink` → **Realm roles** | The four CVDLINK roles visible in the list with their descriptions: `cvdlink-healthcare-professional`, `cvdlink-researcher`, `cvdlink-resource-manager`, `cvdlink-admin`. (`uma_authorization`, `offline_access`, `default-roles-cvdlink` may also be visible — that's fine.) |
| 2 | `docs/images/16-user-roles.png` | Admin Console → **Users** → click `admin` → **Role mapping** tab | The admin user's role mapping showing all four CVDLINK roles assigned (Inherited = False on each). |
| 3 | `docs/images/04-users-list.png` | Admin Console → **Users** | The two users (`admin`, `researcher`). Re-shoot for visual freshness. |
| 4 | `docs/images/03-app-post-login-claims.png` | Sample app → **Login** → log in as `admin` / `admin123` | The decoded JWT panel with `realm_access.roles` containing all four CVDLINK role slugs. (Logging in as `admin` instead of `researcher` makes the role list more interesting.) |
| 5 | `docs/images/05-app-admin-403-researcher.png` | Sample app while logged in as `researcher` / `researcher123` → click **GET /admin** | API panel showing `status: 403` and body `{ "error": "requires role: cvdlink-admin" }`. |
| 6 | `docs/images/06-app-admin-200-admin.png` | Sample app while logged in as `admin` / `admin123` → click **GET /admin** | API panel showing `status: 200` and body `{ "message": "you are an admin", "user": "admin" }`. |

## Recommended order

1. Take #4 (admin login → JWT claims) and #6 (admin → /admin → 200) in the same admin session.
2. Logout, log in as `researcher`, take #5 (researcher → /admin → 403).
3. Open admin console, take #1, #2, #3.

## After capture

```powershell
git add docs/images/11-realm-roles.png docs/images/16-user-roles.png `
        docs/images/04-users-list.png docs/images/03-app-post-login-claims.png `
        docs/images/05-app-admin-403-researcher.png docs/images/06-app-admin-200-admin.png
git commit -m "docs: re-capture screenshots for cvdlink roles"
```

## Tear down when done

```powershell
docker compose down
```

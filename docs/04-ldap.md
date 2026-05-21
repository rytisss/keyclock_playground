# 4. LDAP federation (optional)

This guide adds OpenLDAP as an authoritative user directory and federates it
into a new `ldap` realm in Keycloak. It is **opt-in** — the default
`docker compose up -d` flow does not touch any of it.

> **Time:** ~5 minutes (one-shot seed runs in <30s once Keycloak is healthy)
> **Prereqs:** Docker + Docker Compose v2; the base playground already runs.
> **What it does NOT do:** modify the existing `cvdlink` realm, or expose
> LDAPS / TLS.

---

## 4.1 What you get

When the `ldap` profile is active, the stack gains two containers:

| Service     | Image                          | Host port → container | Role |
|-------------|--------------------------------|------------------------|------|
| `openldap`  | `osixia/openldap:1.5.0`        | **389 → 389**          | Authoritative user store |
| `ldap-seed` | built from `./ldap/seed`       | (none)                 | One-shot bootstrap |

And a new realm in the existing Keycloak:

| Realm  | Federation                  | Users (from `ldap/users.yaml`) | Groups               |
|--------|-----------------------------|--------------------------------|----------------------|
| `ldap` | OpenLDAP, `editMode: WRITE` | `alice`, `bob`                 | `developers`, `admins` |

The original `cvdlink` realm is untouched.

---

## 4.2 Start it

```bash
docker compose --profile ldap up -d --build
```

This brings up `openldap` and runs `ldap-seed` once. The seed container:

1. Upserts users + groups into OpenLDAP from `ldap/users.yaml`.
2. Creates the `ldap` realm in Keycloak if it doesn't exist.
3. Registers OpenLDAP as a `UserStorageProvider` on the realm.
4. Adds a group mapper so `groupOfNames` membership is visible in Keycloak.

Tail the seed log to confirm:

```bash
docker compose logs ldap-seed
```

Expected last line: `INFO done`.

> ℹ️ The `osixia/openldap` image is slow to initialise on first start (can take
> 60–120s on a cold build). The seed container retries the LDAP connection for
> up to 3 minutes. If `ldap-seed` still exits non-zero, the LDAP container
> wasn't ready yet — just re-run the seed manually (it is idempotent):
> `docker compose --profile ldap run --rm ldap-seed`.

---

## 4.3 Verify

### In the admin console

1. Open http://localhost:8081/admin (admin / admin).
2. Switch realm dropdown (top-left) to `ldap`.
3. **Users** → search `alice`. The entry shows a gray *LDAP* badge.
4. **User federation** → `ldap` provider listed, status enabled.
5. **Groups** → `developers`, `admins` listed.

### From the command line

```bash
# list LDAP users
docker compose exec openldap ldapsearch -x -LLL \
  -D "cn=admin,dc=cvdlink,dc=local" -w admin \
  -b "ou=people,dc=cvdlink,dc=local" "(objectClass=inetOrgPerson)" uid mail
```

```bash
# fetch alice via the Keycloak admin API
TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" \
  -d "grant_type=password" | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8081/admin/realms/ldap/users?username=alice" | jq
```

### As the user

Log into the user-facing account console:

```
http://localhost:8081/realms/ldap/account
```

Credentials: `alice` / `changeme` (from `ldap/users.yaml`).

---

## 4.4 Re-seed

Idempotent — safe to re-run any time after editing `ldap/users.yaml`:

```bash
docker compose --profile ldap run --rm ldap-seed
```

Existing users are updated in place; existing groups are left alone.

---

## 4.5 Run the tests

```bash
docker compose --profile ldap run --rm ldap-seed pytest -v
```

Covers:
- Config YAML parsing (`test_config.py`)
- LDAP upsert idempotency + password bind + group membership (`test_ldap_ops.py`)
- End-to-end visibility in LDAP and federated Keycloak realm (`test_directory.py`)

---

## 4.6 Add a user

### Declarative (recommended — reproducible)

Edit `ldap/users.yaml`:

```yaml
users:
  - uid: charlie
    cn: Charlie Clark
    sn: Clark
    mail: charlie@cvdlink.local
    password: changeme
    groups: [developers]
```

Then:

```bash
docker compose --profile ldap run --rm ldap-seed
```

### Via Keycloak admin UI

Realm `ldap` → Users → *Add user*. Federation is `WRITABLE`, so the user is
written through to OpenLDAP.

### Via raw LDAP

```bash
docker compose exec openldap ldapadd -x \
  -D "cn=admin,dc=cvdlink,dc=local" -w admin <<'EOF'
dn: uid=charlie,ou=people,dc=cvdlink,dc=local
objectClass: inetOrgPerson
uid: charlie
cn: Charlie Clark
sn: Clark
mail: charlie@cvdlink.local
userPassword: changeme
EOF
```

---

## 4.7 Tear it down

```bash
# stop only LDAP, keep base playground running
docker compose --profile ldap down

# stop everything but keep data
docker compose down

# nuke everything (postgres + openldap volumes)
docker compose down -v
```

---

**Next:** Try a login flow against the `ldap` realm — point the
[`examples/cvdlink-login-sample`](../examples/cvdlink-login-sample/) at
`http://localhost:8081/realms/ldap` (after creating a client there).

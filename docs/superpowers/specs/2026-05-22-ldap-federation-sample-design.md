# LDAP federation sample (optional) — design

Date: 2026-05-22
Status: approved
Branch: feature/ldap_sample

## Goal

Add an optional, self-contained OpenLDAP + Keycloak federation demo to the
`keyclock_playground` repo. Default `docker compose up -d` behaviour is
unchanged. The LDAP demo is opt-in via a Compose profile and ships its own
realm, declarative user data, and pytest suite.

## Non-goals

- Federating LDAP users into the existing `cvdlink` realm.
- TLS / LDAPS — plaintext on the Docker network only.
- A new browser-based sample app for the `ldap` realm — out of scope for this
  spec; the existing `python-api` / `cvdlink-login-sample` patterns can be
  reused later.
- Production hardening of any kind.

## Architecture

### Repo layout

```
ldap/
├── README.md                 # short how-to; full walkthrough is docs/04-ldap.md
├── bootstrap.ldif            # OUs: people, groups (under dc=cvdlink,dc=local)
├── users.yaml                # declarative users + groups
└── seed/
    ├── Dockerfile            # python:3.12-slim, installs the seed package
    ├── pyproject.toml        # ldap3, python-keycloak, tenacity, pyyaml; dev: pytest
    ├── seed/                 # importable package
    │   ├── __init__.py
    │   ├── config.py         # yaml → User / Group dataclasses
    │   ├── ldap_ops.py       # upsert_user, upsert_group, delete_entry
    │   ├── keycloak_ops.py   # ensure_realm, ensure_ldap_federation, ensure_group_mapper
    │   └── main.py           # entrypoint: connect, seed, federate
    └── tests/
        ├── __init__.py
        ├── conftest.py       # ldap_conn / base_dn fixtures
        ├── test_config.py    # yaml parsing
        ├── test_ldap_ops.py  # idempotency, bind, group membership
        └── test_directory.py # end-to-end: present in LDAP, visible in Keycloak

docs/04-ldap.md               # walkthrough, linked from README

docker-compose.yml            # two new services under profile ["ldap"]
README.md                     # updated table of contents + new section
```

### Compose changes

Two services added to the existing `docker-compose.yml`, both gated under
profile `ldap`. The default `up -d` invocation does not start them.

```yaml
openldap:
  image: osixia/openldap:1.5.0
  container_name: kc-openldap
  profiles: ["ldap"]
  environment:
    LDAP_ORGANISATION: CVDLINK
    LDAP_DOMAIN: cvdlink.local
    LDAP_ADMIN_PASSWORD: admin
    LDAP_CONFIG_PASSWORD: config
  ports:
    - "389:389"
  volumes:
    - openldap_data:/var/lib/ldap
    - openldap_config:/etc/ldap/slapd.d
    - ./ldap:/container/service/slapd/assets/config/bootstrap/ldif/custom:ro
  command: ["--copy-service"]

ldap-seed:
  build: ./ldap/seed
  container_name: kc-ldap-seed
  profiles: ["ldap"]
  depends_on:
    - openldap
    - keycloak
  environment:
    LDAP_URL: ldap://openldap:389
    LDAP_BASE_DN: dc=cvdlink,dc=local
    LDAP_ADMIN_DN: cn=admin,dc=cvdlink,dc=local
    LDAP_ADMIN_PASSWORD: admin
    KC_URL: http://keycloak:8080
    KC_ADMIN_USER: admin
    KC_ADMIN_PASSWORD: admin
    KC_REALM: ldap
```

Volumes `openldap_data` and `openldap_config` are added to the top-level
`volumes:` block.

### Naming

- Container names follow the existing `kc-*` prefix: `kc-openldap`,
  `kc-ldap-seed`.
- Service names: `openldap`, `ldap-seed`.
- LDAP base DN: `dc=cvdlink,dc=local` (per user choice).
- Keycloak realm: `ldap`.

### Defaults / configuration

All values are hard-coded in `docker-compose.yml` to match the existing repo's
"playground" style (which already does the same for Keycloak admin and DB
passwords). No `.env` file is introduced. Anyone wanting to change a value
edits `docker-compose.yml` directly.

### LDAP bootstrap

`ldap/bootstrap.ldif` defines two organisational units under the base DN:

```
ou=people,dc=cvdlink,dc=local
ou=groups,dc=cvdlink,dc=local
```

`osixia/openldap` runs every `*.ldif` in the mounted `custom/` directory on
first start. Subsequent restarts skip already-applied LDIFs.

### Seed flow (`ldap-seed`)

`main.py` runs once and exits:

1. Load `users.yaml` into `Config(users, groups)`.
2. Connect to LDAP as admin (with tenacity retry, 60s deadline).
3. `upsert_group` for each group; `upsert_user` for each user. Both are
   idempotent — `add` then ignore `entryAlreadyExists`; for users, replace
   mutable attrs; for group membership, ignore `attributeOrValueExists`.
4. Connect to Keycloak admin (with tenacity retry, 120s deadline) using the
   master-realm admin/admin credentials.
5. `ensure_realm("ldap")` — create the realm if absent; set `sslRequired=NONE`
   for plain-HTTP playground use.
6. `ensure_ldap_federation` — add a `UserStorageProvider` component pointed at
   `openldap:389`, `editMode: WRITABLE`. Returns existing component if one
   named `ldap` already exists on this realm.
7. `ensure_group_mapper` — add a `group-ldap-mapper` so `groupOfNames`
   membership under `ou=groups` is visible in the Keycloak realm.

All steps are idempotent: re-running the seed against a populated stack is a
no-op.

### Seed data (`ldap/users.yaml`)

```yaml
users:
  - uid: alice
    cn: Alice Anderson
    sn: Anderson
    mail: alice@cvdlink.local
    password: changeme
    groups: [developers]
  - uid: bob
    cn: Bob Brown
    sn: Brown
    mail: bob@cvdlink.local
    password: changeme
    groups: [admins]

groups:
  - developers
  - admins
```

Note: groups here are LDAP groups, scoped to the `ldap` realm. They are
deliberately not mapped to the existing CVDLINK realm roles — the LDAP demo
is a separate realm.

## Usage

```bash
# bring up the LDAP profile (openldap + a one-shot ldap-seed)
docker compose --profile ldap up -d

# the ldap-seed container runs once and exits successfully; verify:
docker compose logs ldap-seed

# re-seed (idempotent)
docker compose --profile ldap run --rm ldap-seed

# tests
docker compose --profile ldap run --rm ldap-seed pytest -v

# tear down only LDAP (default services untouched)
docker compose --profile ldap down

# full wipe (including the cvdlink realm data)
docker compose down -v
```

## Tests

Four files in `ldap/seed/tests/`, mirroring the reference implementation's
shape:

| File | Covers |
|---|---|
| `test_config.py` | yaml → `User` / `Group` dataclasses |
| `test_ldap_ops.py` | `upsert_group` idempotency; `upsert_user` sets password (bindable) and records group membership |
| `test_directory.py` | end-to-end: alice present in LDAP under `ou=people`; alice can bind with seeded password; alice visible in Keycloak realm `ldap`; alice is a `member` of `cn=developers,ou=groups` |

The `conftest.py` exposes an `ldap_conn` fixture (admin-bound `ldap3.Connection`
to `$LDAP_URL`) and a `base_dn` fixture (reads `$LDAP_BASE_DN`).

Tests run inside the `ldap-seed` container so they share the compose network
(`openldap`, `keycloak` resolvable by service name) without any host-side
venv / port-forwarding setup.

## README updates

The existing `README.md` already has a table of contents (lines 5–15). We
extend it with:

- `## LDAP federation (optional)` linking to a new section.
- A short section below "Custom login theme (CVDLINK)" with:
  - One-paragraph what/why.
  - Three-command quickstart (`up`, `seed`, test).
  - Link to `docs/04-ldap.md` for the full walkthrough.
- A note in Quickstart that LDAP is opt-in.

The new doc `docs/04-ldap.md` covers: prerequisites, profile-up flow, what
gets created (realm, federation, users/groups), how to verify in the admin
console, how to run tests, how to wipe.

## Dependencies

Python (in `ldap/seed/pyproject.toml`):

```
ldap3==2.9.1
python-keycloak==4.2.0
httpx<0.28
pyyaml==6.0.2
tenacity==8.5.0
# dev:
pytest==8.3.2
```

Pinned to match the reference implementation. `python-keycloak` 4.2.0 targets
Keycloak's admin REST API, which is stable between Keycloak 24 and 26 for the
admin operations we use (realms, components, users).

## Risks / open questions

- **Keycloak 26 vs reference's 24.** The reference uses Keycloak 24; this repo
  uses Keycloak 26. The admin REST endpoints we call
  (`/realms`, `/components`) are unchanged. Tests will catch any regression.
- **`osixia/openldap` image age.** Pinned to `1.5.0`, same as the reference;
  it is not actively maintained but works for sandbox use. Not changing for
  this spec.
- **No host-side test path.** Tests only run inside the container. This is
  intentional — keeps the demo self-contained and reproducible. If a host
  workflow is later needed, openldap is already exposed on `localhost:389`.

## Git / commit policy

Per user direction:

- Commit messages: no conventional-commit prefixes (`feat:`, `docs:`, etc.).
- No `Co-Authored-By: Claude` trailers.
- Each logical chunk gets its own commit (compose, seed package, tests,
  docs).

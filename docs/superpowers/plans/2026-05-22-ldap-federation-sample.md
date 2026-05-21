# LDAP Federation Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional OpenLDAP + Keycloak federation demo to `keyclock_playground`, gated behind a Compose profile so default `docker compose up -d` behaviour is unchanged.

**Architecture:** Two new Compose services (`openldap`, `ldap-seed`) under profile `ldap`. A one-shot Python container seeds users/groups into OpenLDAP from `users.yaml` and configures a new `ldap` realm in Keycloak with LDAP federation. Pytest suite runs inside the same container against the live stack.

**Tech Stack:** `osixia/openldap:1.5.0`, Python 3.12, `ldap3==2.9.1`, `python-keycloak==4.2.0`, `tenacity==8.5.0`, `pyyaml==6.0.2`, `pytest==8.3.2`. Existing repo: Keycloak 26 + Postgres 16 + Docker Compose v2.

**Commit policy:** No `feat:`/`docs:`/etc prefixes. No `Co-Authored-By: Claude` trailer. Plain imperative subject lines.

---

## Repo orientation (read before starting)

- `C:\src\keyclock_playground\docker-compose.yml` — existing stack (`postgres`, `keycloak`). We append two services here.
- `C:\src\keyclock_playground\realm-export.json` — auto-imported `cvdlink` realm. **Do not modify.** The LDAP demo uses a separate realm.
- `C:\src\keyclock_playground\README.md` — has an existing Table of contents (lines 5–15). We extend it.
- `C:\src\keyclock_playground\docs\` — existing numbered docs `01-installation.md`, `02-realm-setup.md`, `03-oidc-flow.md`. We add `04-ldap.md`.
- Reference impl (read-only inspiration): `C:\src\ldap\` — same overall pattern; ours diverges on realm name, base DN, profile-gating, and container naming.

---

## File structure

**New files:**

```
ldap/
├── README.md
├── bootstrap.ldif
├── users.yaml
└── seed/
    ├── Dockerfile
    ├── pyproject.toml
    ├── seed/
    │   ├── __init__.py
    │   ├── config.py
    │   ├── ldap_ops.py
    │   ├── keycloak_ops.py
    │   └── main.py
    └── tests/
        ├── __init__.py
        ├── conftest.py
        ├── test_config.py
        ├── test_ldap_ops.py
        └── test_directory.py

docs/04-ldap.md
```

**Modified files:**

- `docker-compose.yml` — append two services and two volumes.
- `README.md` — extend TOC, add new section.

**Per-file responsibility:**

| File | Responsibility |
|---|---|
| `ldap/bootstrap.ldif` | LDAP organisational units (`ou=people`, `ou=groups`) |
| `ldap/users.yaml` | Declarative source of users + groups |
| `ldap/seed/seed/config.py` | YAML → `User` / `Group` / `Config` dataclasses |
| `ldap/seed/seed/ldap_ops.py` | Idempotent LDAP upserts |
| `ldap/seed/seed/keycloak_ops.py` | Idempotent realm + federation + group-mapper |
| `ldap/seed/seed/main.py` | Entrypoint — connects, calls ops in order, exits |
| `ldap/seed/tests/conftest.py` | `ldap_conn` and `base_dn` fixtures |
| `ldap/seed/tests/test_config.py` | YAML parsing |
| `ldap/seed/tests/test_ldap_ops.py` | Idempotency, password bind, group membership |
| `ldap/seed/tests/test_directory.py` | End-to-end against live stack |
| `docs/04-ldap.md` | Full walkthrough |
| `ldap/README.md` | Pointer to `docs/04-ldap.md` + quickstart |

---

## Task 1: LDAP bootstrap LDIF + declarative users

**Files:**
- Create: `ldap/bootstrap.ldif`
- Create: `ldap/users.yaml`

- [ ] **Step 1: Create `ldap/bootstrap.ldif`**

```ldif
dn: ou=people,dc=cvdlink,dc=local
objectClass: organizationalUnit
ou: people

dn: ou=groups,dc=cvdlink,dc=local
objectClass: organizationalUnit
ou: groups
```

- [ ] **Step 2: Create `ldap/users.yaml`**

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

- [ ] **Step 3: Commit**

```bash
git add ldap/bootstrap.ldif ldap/users.yaml
git commit -m "Add LDAP bootstrap LDIF and declarative users"
```

---

## Task 2: Python package skeleton (Dockerfile + pyproject)

**Files:**
- Create: `ldap/seed/pyproject.toml`
- Create: `ldap/seed/Dockerfile`
- Create: `ldap/seed/seed/__init__.py`
- Create: `ldap/seed/tests/__init__.py`

- [ ] **Step 1: Create `ldap/seed/pyproject.toml`**

```toml
[project]
name = "playground-ldap-seed"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "ldap3==2.9.1",
  "python-keycloak==4.2.0",
  "httpx<0.28",
  "pyyaml==6.0.2",
  "tenacity==8.5.0",
]

[project.optional-dependencies]
dev = ["pytest==8.3.2"]

[project.scripts]
playground-ldap-seed = "seed.main:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

- [ ] **Step 2: Create `ldap/seed/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
COPY seed ./seed
RUN pip install --no-cache-dir -e ".[dev]"

COPY tests ./tests
COPY users.yaml ./users.yaml

CMD ["playground-ldap-seed"]
```

Note: `users.yaml` is copied from the build context (which is `./ldap/seed/`) — see Task 7 for how we make this work (the file lives one level up, so the Compose `build:` context will be `./ldap` and the Dockerfile is at `./seed/Dockerfile`). Adjust now: change `WORKDIR` line below and re-do.

Replace with the corrected version:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY seed/pyproject.toml ./
COPY seed/seed ./seed
RUN pip install --no-cache-dir -e ".[dev]"

COPY seed/tests ./tests
COPY users.yaml ./users.yaml

CMD ["playground-ldap-seed"]
```

This file lives at `ldap/seed/Dockerfile` but build context is `./ldap` so paths are `seed/...` and `users.yaml`.

- [ ] **Step 3: Create empty `ldap/seed/seed/__init__.py`**

```python
```

- [ ] **Step 4: Create empty `ldap/seed/tests/__init__.py`**

```python
```

- [ ] **Step 5: Commit**

```bash
git add ldap/seed/pyproject.toml ldap/seed/Dockerfile ldap/seed/seed/__init__.py ldap/seed/tests/__init__.py
git commit -m "Scaffold ldap-seed Python package and Dockerfile"
```

---

## Task 3: Config dataclasses (TDD)

**Files:**
- Create: `ldap/seed/seed/config.py`
- Test: `ldap/seed/tests/test_config.py`

- [ ] **Step 1: Write the failing test `ldap/seed/tests/test_config.py`**

```python
from pathlib import Path
import textwrap

from seed.config import load_config, User, Group


def test_load_config_parses_users_and_groups(tmp_path: Path):
    path = tmp_path / "users.yaml"
    path.write_text(textwrap.dedent("""
        users:
          - uid: alice
            cn: Alice Anderson
            sn: Anderson
            mail: alice@cvdlink.local
            password: secret
            groups: [developers]
        groups:
          - developers
          - admins
    """))

    cfg = load_config(path)

    assert cfg.users == [
        User(
            uid="alice",
            cn="Alice Anderson",
            sn="Anderson",
            mail="alice@cvdlink.local",
            password="secret",
            groups=["developers"],
        )
    ]
    assert cfg.groups == [Group(name="developers"), Group(name="admins")]


def test_load_config_handles_missing_sections(tmp_path: Path):
    path = tmp_path / "empty.yaml"
    path.write_text("{}\n")

    cfg = load_config(path)

    assert cfg.users == []
    assert cfg.groups == []
```

- [ ] **Step 2: Run the test (expect ImportError)**

We don't have a live LDAP up yet, so run pytest **on the host** for this unit test only. The Docker build path is exercised in Task 7. For now, on the host:

```bash
cd ldap/seed
python -m venv .venv
.venv\Scripts\Activate.ps1     # PowerShell on Windows
pip install -e ".[dev]"
pytest tests/test_config.py -v
```

Expected: collection error or ImportError on `from seed.config import ...`.

- [ ] **Step 3: Implement `ldap/seed/seed/config.py`**

```python
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass(frozen=True)
class User:
    uid: str
    cn: str
    sn: str
    mail: str
    password: str
    groups: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Group:
    name: str


@dataclass(frozen=True)
class Config:
    users: list[User]
    groups: list[Group]


def load_config(path: Path) -> Config:
    data = yaml.safe_load(path.read_text()) or {}
    users = [User(**u) for u in data.get("users", [])]
    groups = [Group(name=g) for g in data.get("groups", [])]
    return Config(users=users, groups=groups)
```

- [ ] **Step 4: Run the test (expect PASS)**

```bash
pytest tests/test_config.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add ldap/seed/seed/config.py ldap/seed/tests/test_config.py
git commit -m "Add config dataclasses and YAML loader for ldap-seed"
```

---

## Task 4: LDAP ops (test+implementation, host-unit-test deferred to Task 8)

**Files:**
- Create: `ldap/seed/seed/ldap_ops.py`
- Create: `ldap/seed/tests/test_ldap_ops.py`
- Create: `ldap/seed/tests/conftest.py`

These tests require a live OpenLDAP. They will be run via Docker in Task 8. Write them now so they're committed alongside the implementation.

- [ ] **Step 1: Create `ldap/seed/tests/conftest.py`**

```python
import os

import pytest
from ldap3 import ALL, Connection, Server


@pytest.fixture
def ldap_conn():
    server = Server(os.environ["LDAP_URL"], get_info=ALL)
    conn = Connection(
        server,
        user=os.environ["LDAP_ADMIN_DN"],
        password=os.environ["LDAP_ADMIN_PASSWORD"],
        auto_bind=True,
    )
    yield conn
    conn.unbind()


@pytest.fixture
def base_dn() -> str:
    return os.environ["LDAP_BASE_DN"]
```

- [ ] **Step 2: Create `ldap/seed/tests/test_ldap_ops.py`**

```python
import os

from ldap3 import Connection, Server

from seed.config import Group, User
from seed.ldap_ops import delete_entry, upsert_group, upsert_user


def test_upsert_group_is_idempotent(ldap_conn, base_dn):
    g = Group(name="qa")
    upsert_group(ldap_conn, base_dn, g)
    upsert_group(ldap_conn, base_dn, g)  # second call must not fail

    ldap_conn.search(f"ou=groups,{base_dn}", "(cn=qa)", attributes=["cn"])
    assert len(ldap_conn.entries) == 1

    delete_entry(ldap_conn, f"cn=qa,ou=groups,{base_dn}")


def test_upsert_user_sets_password_and_group(ldap_conn, base_dn):
    upsert_group(ldap_conn, base_dn, Group(name="testers"))
    u = User(
        uid="tester1",
        cn="Test One",
        sn="One",
        mail="t1@cvdlink.local",
        password="pw12345",
        groups=["testers"],
    )
    upsert_user(ldap_conn, base_dn, u)

    server = Server(os.environ["LDAP_URL"])
    user_dn = f"uid=tester1,ou=people,{base_dn}"
    bind_conn = Connection(server, user=user_dn, password="pw12345", auto_bind=True)
    assert bind_conn.bound
    bind_conn.unbind()

    ldap_conn.search(
        f"cn=testers,ou=groups,{base_dn}",
        "(objectClass=groupOfNames)",
        attributes=["member"],
    )
    assert user_dn in ldap_conn.entries[0]["member"].values

    delete_entry(ldap_conn, user_dn)
    delete_entry(ldap_conn, f"cn=testers,ou=groups,{base_dn}")
```

- [ ] **Step 3: Implement `ldap/seed/seed/ldap_ops.py`**

```python
from ldap3 import MODIFY_ADD, MODIFY_REPLACE, Connection

from .config import Group, User


def _user_dn(uid: str, base_dn: str) -> str:
    return f"uid={uid},ou=people,{base_dn}"


def _group_dn(name: str, base_dn: str) -> str:
    return f"cn={name},ou=groups,{base_dn}"


def upsert_group(conn: Connection, base_dn: str, group: Group) -> None:
    dn = _group_dn(group.name, base_dn)
    # groupOfNames requires at least one member; use the group DN itself as a placeholder
    placeholder = dn
    attrs = {
        "objectClass": ["groupOfNames"],
        "cn": group.name,
        "member": [placeholder],
    }
    if not conn.add(dn, attributes=attrs):
        if conn.result["description"] != "entryAlreadyExists":
            raise RuntimeError(f"add group failed: {conn.result}")


def upsert_user(conn: Connection, base_dn: str, user: User) -> None:
    dn = _user_dn(user.uid, base_dn)
    attrs = {
        "objectClass": ["inetOrgPerson"],
        "uid": user.uid,
        "cn": user.cn,
        "sn": user.sn,
        "mail": user.mail,
        "userPassword": user.password,
    }
    if not conn.add(dn, attributes=attrs):
        if conn.result["description"] != "entryAlreadyExists":
            raise RuntimeError(f"add user failed: {conn.result}")
        conn.modify(
            dn,
            {
                "cn": [(MODIFY_REPLACE, [user.cn])],
                "sn": [(MODIFY_REPLACE, [user.sn])],
                "mail": [(MODIFY_REPLACE, [user.mail])],
                "userPassword": [(MODIFY_REPLACE, [user.password])],
            },
        )

    for gname in user.groups:
        gdn = _group_dn(gname, base_dn)
        conn.modify(gdn, {"member": [(MODIFY_ADD, [dn])]})
        if conn.result["description"] not in ("success", "attributeOrValueExists"):
            raise RuntimeError(f"add member failed: {conn.result}")


def delete_entry(conn: Connection, dn: str) -> None:
    if not conn.delete(dn):
        if conn.result["description"] != "noSuchObject":
            raise RuntimeError(f"delete failed: {conn.result}")
```

- [ ] **Step 4: Commit**

```bash
git add ldap/seed/seed/ldap_ops.py ldap/seed/tests/conftest.py ldap/seed/tests/test_ldap_ops.py
git commit -m "Add idempotent LDAP upsert/delete operations and tests"
```

(Tests in this task will only pass against a live LDAP — verified in Task 8.)

---

## Task 5: Keycloak ops (implementation only — tested end-to-end in Task 8)

**Files:**
- Create: `ldap/seed/seed/keycloak_ops.py`

No standalone unit tests for this module: the operations are thin wrappers over the Keycloak admin API. Behaviour is verified by `test_directory.py` against the live stack (Task 8).

- [ ] **Step 1: Implement `ldap/seed/seed/keycloak_ops.py`**

```python
from keycloak import KeycloakAdmin


def ensure_realm(admin: KeycloakAdmin, realm: str) -> None:
    existing = [r["realm"] for r in admin.get_realms()]
    if realm not in existing:
        admin.create_realm({"realm": realm, "enabled": True})
    # Allow plain HTTP access from any host (sandbox only).
    for r in ("master", realm):
        admin.connection.realm_name = r
        admin.update_realm(r, {"sslRequired": "NONE"})
    admin.connection.realm_name = realm


def ensure_ldap_federation(
    admin: KeycloakAdmin,
    realm: str,
    ldap_url: str,
    base_dn: str,
    admin_dn: str,
    admin_password: str,
) -> str:
    admin.connection.realm_name = realm
    # Keycloak stores `parentId` as the realm's internal UUID, not the realm name.
    # A string realm name here creates an orphaned component that federation search skips.
    realm_uuid = admin.get_realm(realm)["id"]

    components = admin.get_components(
        query={"parent": realm_uuid, "type": "org.keycloak.storage.UserStorageProvider"}
    )
    for c in components:
        if c["name"] == "ldap":
            return c["id"]

    payload = {
        "name": "ldap",
        "providerId": "ldap",
        "providerType": "org.keycloak.storage.UserStorageProvider",
        "parentId": realm_uuid,
        "config": {
            "enabled": ["true"],
            "editMode": ["WRITABLE"],
            "vendor": ["other"],
            "connectionUrl": [ldap_url],
            "usersDn": [f"ou=people,{base_dn}"],
            "bindDn": [admin_dn],
            "bindCredential": [admin_password],
            "authType": ["simple"],
            "searchScope": ["1"],
            "userObjectClasses": ["inetOrgPerson"],
            "usernameLDAPAttribute": ["uid"],
            "rdnLDAPAttribute": ["uid"],
            "uuidLDAPAttribute": ["entryUUID"],
            "importEnabled": ["true"],
            "syncRegistrations": ["true"],
        },
    }
    return admin.create_component(payload)


def ensure_group_mapper(
    admin: KeycloakAdmin, realm: str, federation_id: str, base_dn: str
) -> None:
    admin.connection.realm_name = realm
    mappers = admin.get_components(query={"parent": federation_id})
    if any(m["name"] == "group-mapper" for m in mappers):
        return
    admin.create_component(
        {
            "name": "group-mapper",
            "providerId": "group-ldap-mapper",
            "providerType": "org.keycloak.storage.ldap.mappers.LDAPStorageMapper",
            "parentId": federation_id,
            "config": {
                "groups.dn": [f"ou=groups,{base_dn}"],
                "group.name.ldap.attribute": ["cn"],
                "group.object.classes": ["groupOfNames"],
                "membership.attribute.type": ["DN"],
                "membership.ldap.attribute": ["member"],
                "membership.user.ldap.attribute": ["uid"],
                "mode": ["READ_ONLY"],
                "user.roles.retrieve.strategy": ["LOAD_GROUPS_BY_MEMBER_ATTRIBUTE"],
                "preserve.group.inheritance": ["false"],
                "drop.non.existing.groups.during.sync": ["false"],
            },
        }
    )
```

- [ ] **Step 2: Commit**

```bash
git add ldap/seed/seed/keycloak_ops.py
git commit -m "Add idempotent Keycloak realm and LDAP federation setup"
```

---

## Task 6: Seed entrypoint + end-to-end test

**Files:**
- Create: `ldap/seed/seed/main.py`
- Create: `ldap/seed/tests/test_directory.py`

- [ ] **Step 1: Implement `ldap/seed/seed/main.py`**

```python
import logging
import os
import sys
from pathlib import Path

from keycloak import KeycloakAdmin
from ldap3 import Connection, Server
from tenacity import retry, stop_after_delay, wait_fixed

from .config import load_config
from .keycloak_ops import ensure_group_mapper, ensure_ldap_federation, ensure_realm
from .ldap_ops import upsert_group, upsert_user

log = logging.getLogger("seed")


@retry(stop=stop_after_delay(60), wait=wait_fixed(2), reraise=True)
def _ldap_connect() -> Connection:
    server = Server(os.environ["LDAP_URL"])
    return Connection(
        server,
        user=os.environ["LDAP_ADMIN_DN"],
        password=os.environ["LDAP_ADMIN_PASSWORD"],
        auto_bind=True,
    )


@retry(stop=stop_after_delay(120), wait=wait_fixed(3), reraise=True)
def _keycloak_admin() -> KeycloakAdmin:
    return KeycloakAdmin(
        server_url=os.environ["KC_URL"],
        username=os.environ["KC_ADMIN_USER"],
        password=os.environ["KC_ADMIN_PASSWORD"],
        realm_name="master",
        verify=False,
    )


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    base_dn = os.environ["LDAP_BASE_DN"]
    realm = os.environ["KC_REALM"]

    cfg = load_config(Path("/app/users.yaml"))

    log.info("connecting to LDAP…")
    conn = _ldap_connect()
    log.info("seeding %d groups, %d users", len(cfg.groups), len(cfg.users))
    for g in cfg.groups:
        upsert_group(conn, base_dn, g)
    for u in cfg.users:
        upsert_user(conn, base_dn, u)

    log.info("connecting to Keycloak…")
    admin = _keycloak_admin()
    ensure_realm(admin, realm)
    fed_id = ensure_ldap_federation(
        admin,
        realm,
        ldap_url=os.environ["LDAP_URL"],
        base_dn=base_dn,
        admin_dn=os.environ["LDAP_ADMIN_DN"],
        admin_password=os.environ["LDAP_ADMIN_PASSWORD"],
    )
    ensure_group_mapper(admin, realm, fed_id, base_dn)

    log.info("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Create `ldap/seed/tests/test_directory.py`**

```python
import os

from keycloak import KeycloakAdmin
from ldap3 import Connection, Server


def test_seeded_user_present_in_ldap(ldap_conn, base_dn):
    ldap_conn.search(f"ou=people,{base_dn}", "(uid=alice)", attributes=["mail"])
    assert len(ldap_conn.entries) == 1
    assert ldap_conn.entries[0]["mail"].value == "alice@cvdlink.local"


def test_seeded_user_can_bind(base_dn):
    server = Server(os.environ["LDAP_URL"])
    conn = Connection(
        server,
        user=f"uid=alice,ou=people,{base_dn}",
        password="changeme",
        auto_bind=True,
    )
    assert conn.bound
    conn.unbind()


def test_user_visible_in_keycloak_realm():
    admin = KeycloakAdmin(
        server_url=os.environ["KC_URL"],
        username=os.environ["KC_ADMIN_USER"],
        password=os.environ["KC_ADMIN_PASSWORD"],
        realm_name=os.environ["KC_REALM"],
        user_realm_name="master",
        verify=False,
    )
    users = admin.get_users({"username": "alice"})
    assert any(u["username"] == "alice" for u in users), "alice not federated into Keycloak"


def test_group_membership(ldap_conn, base_dn):
    ldap_conn.search(
        f"cn=developers,ou=groups,{base_dn}",
        "(objectClass=groupOfNames)",
        attributes=["member"],
    )
    assert len(ldap_conn.entries) == 1
    members = ldap_conn.entries[0]["member"].values
    assert f"uid=alice,ou=people,{base_dn}" in members
```

- [ ] **Step 3: Commit**

```bash
git add ldap/seed/seed/main.py ldap/seed/tests/test_directory.py
git commit -m "Add seed entrypoint and directory end-to-end tests"
```

---

## Task 7: Wire LDAP services into docker-compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Read current state**

```bash
cat docker-compose.yml
```

Expected: two services (`postgres`, `keycloak`), one volume (`postgres_data`).

- [ ] **Step 2: Append new services and volumes**

Append to `services:` (after the `keycloak:` block, before the top-level `volumes:` block):

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
    build:
      context: ./ldap
      dockerfile: seed/Dockerfile
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

Update the existing top-level `volumes:` block from:

```yaml
volumes:
  postgres_data:
```

to:

```yaml
volumes:
  postgres_data:
  openldap_data:
  openldap_config:
```

- [ ] **Step 3: Validate compose syntax**

```bash
docker compose config --profile ldap
```

Expected: prints fully-resolved compose config including the two new services and three volumes. Non-zero exit means a YAML error — fix and re-run.

- [ ] **Step 4: Sanity-check that default `up` is unchanged**

```bash
docker compose config
```

Expected: shows only `postgres` and `keycloak` (no `openldap`, no `ldap-seed`) because profile `ldap` is not active.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "Add openldap and ldap-seed services under 'ldap' profile"
```

---

## Task 8: Live integration — bring up the stack, run seed, run tests

**This task verifies the implementation against a live stack. No new files.**

- [ ] **Step 1: Bring up the LDAP profile**

```bash
docker compose --profile ldap up -d --build
```

Expected: `postgres`, `keycloak`, `openldap`, `ldap-seed` containers created. `ldap-seed` runs and exits 0.

- [ ] **Step 2: Verify seed completed successfully**

```bash
docker compose logs ldap-seed
```

Expected: log lines `connecting to LDAP…`, `seeding 2 groups, 2 users`, `connecting to Keycloak…`, `done`. Exit code 0.

If exit code is non-zero, inspect stderr in the log output. Common issues:
- Keycloak not yet up after 120s → bump `stop_after_delay` in `main.py`, but first check `docker compose logs keycloak` for slow startup or errors.
- LDAP bind fails → check `docker compose logs openldap` for LDIF errors.

- [ ] **Step 3: Sanity-check LDAP via ldapsearch**

```bash
docker compose exec openldap ldapsearch -x -LLL -D "cn=admin,dc=cvdlink,dc=local" -w admin -b "ou=people,dc=cvdlink,dc=local" "(objectClass=inetOrgPerson)" uid mail
```

Expected: two entries (`uid: alice`, `uid: bob`) with matching mail attributes.

- [ ] **Step 4: Sanity-check Keycloak realm via curl**

```bash
TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8081/admin/realms/ldap/users?username=alice" | jq
```

Expected: array containing alice's user object. If `jq` not installed, drop the `| jq` and read the JSON directly.

- [ ] **Step 5: Run the test suite inside the seed container**

```bash
docker compose --profile ldap run --rm ldap-seed pytest -v
```

Expected: all tests in `tests/test_config.py`, `tests/test_ldap_ops.py`, `tests/test_directory.py` pass. Typical run: ~10 tests passed.

If `test_user_visible_in_keycloak_realm` fails immediately after the first seed run, the federated user import can be lazy — re-run pytest. If it still fails, run `docker compose --profile ldap run --rm ldap-seed` once more (re-seed is idempotent) and re-test.

- [ ] **Step 6: Verify default `up` still works as before**

```bash
docker compose --profile ldap down
docker compose down -v   # full wipe — losing realm state is fine, it re-imports
docker compose up -d
docker compose ps
```

Expected: only `kc-postgres` and `kc-server` running. No `kc-openldap`, no `kc-ldap-seed`.

```bash
curl -s http://localhost:8081/realms/cvdlink/.well-known/openid-configuration | head -5
```

Expected: valid OIDC config JSON.

- [ ] **Step 7: Commit (verification artifact only — no code change)**

No commit needed unless changes were required to fix issues found during this task.

---

## Task 9: Documentation — `docs/04-ldap.md`

**Files:**
- Create: `docs/04-ldap.md`

- [ ] **Step 1: Create `docs/04-ldap.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/04-ldap.md
git commit -m "Add docs/04-ldap.md walkthrough for LDAP federation"
```

---

## Task 10: `ldap/README.md` — short pointer

**Files:**
- Create: `ldap/README.md`

- [ ] **Step 1: Create `ldap/README.md`**

```markdown
# LDAP federation (optional)

OpenLDAP as the authoritative user store, federated into a separate `ldap`
realm in Keycloak. Opt-in via the `ldap` Compose profile — the default
playground is untouched.

## Quickstart

```bash
docker compose --profile ldap up -d --build
docker compose --profile ldap run --rm ldap-seed pytest -v
```

## Layout

- `bootstrap.ldif` — organisational units (`ou=people`, `ou=groups`)
- `users.yaml` — declarative source of users and groups
- `seed/` — one-shot Python container that seeds LDAP and configures Keycloak

## Full walkthrough

See [`../docs/04-ldap.md`](../docs/04-ldap.md).
```

- [ ] **Step 2: Commit**

```bash
git add ldap/README.md
git commit -m "Add ldap/README.md pointing to the full walkthrough"
```

---

## Task 11: Update top-level `README.md` — table of contents + new section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current table of contents (lines 5–15)**

```bash
sed -n '5,15p' README.md
```

Expected:
```
## Table of contents

- [Content](#content)
- [Quickstart](#quickstart)
- [Screenshots](#screenshots)
- [Repo layout](#repo-layout)
- [Auth flows covered](#auth-flows-covered)
- [Default credentials](#default-credentials)
- [Custom login theme (CVDLINK)](#custom-login-theme-cvdlink)
- [Documentation](#documentation)
- [License](#license)
```

- [ ] **Step 2: Insert a new TOC entry after "Custom login theme (CVDLINK)"**

Use the Edit tool to change:

```
- [Custom login theme (CVDLINK)](#custom-login-theme-cvdlink)
- [Documentation](#documentation)
```

to:

```
- [Custom login theme (CVDLINK)](#custom-login-theme-cvdlink)
- [LDAP federation (optional)](#ldap-federation-optional)
- [Documentation](#documentation)
```

- [ ] **Step 3: Add a note in Quickstart that LDAP is opt-in**

Locate (around lines 27–51) the existing Quickstart fenced block. After the closing ``` on line 49 and before the `> ℹ️ If you change…` blockquote (line 51), insert:

```markdown
> ℹ️ Want an OpenLDAP federation demo on the side? See [LDAP federation (optional)](#ldap-federation-optional).
```

- [ ] **Step 4: Add the new section before `## Documentation`**

Find the `## Documentation` heading (line 149) and insert the following block immediately before it:

```markdown
## LDAP federation (optional)

An OpenLDAP server federated into a separate `ldap` realm in Keycloak. The
default `docker compose up -d` flow is unchanged — this is opt-in via a
Compose profile.

```bash
# bring up the LDAP profile (openldap + a one-shot seed)
docker compose --profile ldap up -d --build

# run the integration test suite
docker compose --profile ldap run --rm ldap-seed pytest -v

# tear down only LDAP
docker compose --profile ldap down
```

The seed container creates the `ldap` realm, registers OpenLDAP as a
`UserStorageProvider`, and writes users/groups from
[`ldap/users.yaml`](ldap/users.yaml). Full walkthrough:
[`docs/04-ldap.md`](docs/04-ldap.md).

```

(Note: the inner fenced ``` block within the new section uses ```bash and closes with ``` — make sure the outer markdown insertion doesn't accidentally close the wrong fence. If editing in an editor that highlights fences, the bash block is self-contained.)

- [ ] **Step 5: Update the `## Documentation` numbered list — add entry 6**

Find:

```
5. [`examples/cvdlink-login-sample/README.md`](examples/cvdlink-login-sample/README.md) — CVDLINK Login Sample walkthrough
```

Append a new line below it:

```
6. [`docs/04-ldap.md`](docs/04-ldap.md) — LDAP federation (optional)
```

- [ ] **Step 6: Update the Repo layout block (around lines 67–82)**

Find inside the existing repo-layout block:

```
└── examples/
    ├── cvdlink-login-sample/        # PKCE login flow, FastAPI static server
    └── python-api/                  # FastAPI + PyJWT JWT validation
```

Replace with:

```
├── examples/
│   ├── cvdlink-login-sample/        # PKCE login flow, FastAPI static server
│   └── python-api/                  # FastAPI + PyJWT JWT validation
└── ldap/                            # OpenLDAP + seed container (opt-in profile)
```

Also update the `docs/` sub-list (around lines 73–78) to include `04-ldap.md`:

```
├── docs/
│   ├── 01-installation.md           # bring up the stack, first admin login
│   ├── 02-realm-setup.md            # manual click-by-click realm config
│   ├── 03-oidc-flow.md              # Auth Code+PKCE, Client Credentials, JWT internals
│   ├── 04-ldap.md                   # LDAP federation (optional)
│   └── images/                      # screenshots referenced from the docs
```

- [ ] **Step 7: Sanity-check the README renders correctly**

```bash
# verify no broken markdown — anchors resolve
grep -nE "^##|^- \[" README.md | head -40
```

Expected: TOC entries align with the actual `## ...` headings — including the new `## LDAP federation (optional)` line. Anchor for that section is `#ldap-federation-optional`.

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "Extend README with LDAP federation (optional) section and TOC entry"
```

---

## Task 12: Final verification + cleanup

- [ ] **Step 1: Full clean-room run**

```bash
docker compose down -v
docker compose --profile ldap up -d --build
docker compose logs -f ldap-seed       # wait until it exits 0
```

- [ ] **Step 2: All tests pass**

```bash
docker compose --profile ldap run --rm ldap-seed pytest -v
```

Expected: all tests pass (test_config x2, test_ldap_ops x2, test_directory x4 = ~8 tests).

- [ ] **Step 3: Default `up` still works after wipe**

```bash
docker compose --profile ldap down
docker compose down -v
docker compose up -d
docker compose ps
curl -s http://localhost:8081/realms/cvdlink/.well-known/openid-configuration | jq -r .issuer
```

Expected: 2 containers (`kc-postgres`, `kc-server`); issuer is `http://localhost:8081/realms/cvdlink`.

- [ ] **Step 4: Review the diff before pushing**

```bash
git log --oneline main..HEAD
git diff main...HEAD --stat
```

Expected: ~9 commits, only new files under `ldap/`, `docs/04-ldap.md`, plus `README.md` and `docker-compose.yml` modifications. No changes to `realm-export.json`, no changes to existing themes or examples.

- [ ] **Step 5: Confirm no `Co-Authored-By: Claude` trailers in any commit**

```bash
git log main..HEAD --format=%B | grep -i "Co-Authored-By" || echo "clean"
```

Expected: prints `clean`.

- [ ] **Step 6: Confirm no `feat:` / `docs:` / `chore:` prefixes on any commit**

```bash
git log main..HEAD --format=%s
```

Expected: no subject begins with `feat:`, `docs:`, `chore:`, `fix:`, etc.

---

## Self-review check

**Spec coverage:**

| Spec item | Task |
|---|---|
| Repo layout (`ldap/`, `docs/04-ldap.md`) | Tasks 1, 9, 10, 11 |
| Compose: openldap + ldap-seed under profile `ldap` | Task 7 |
| Realm `ldap`, base DN `dc=cvdlink,dc=local` | Tasks 1, 5, 7 |
| Hard-coded passwords (no .env) | Task 7 |
| Seed runs during `--profile ldap up` | Task 7 (no `command:` override; runs default CMD on `up`) |
| Idempotent seed | Tasks 4, 5 |
| Four test files (config, ldap_ops, directory, conftest) | Tasks 3, 4, 6 |
| `python-keycloak==4.2.0`, `ldap3==2.9.1`, `tenacity==8.5.0`, `pyyaml==6.0.2`, `pytest==8.3.2` | Task 2 |
| Tests inside container | Tasks 8, 9, 12 |
| README TOC + new section | Task 11 |
| docs/04-ldap.md walkthrough | Task 9 |
| Commit policy: no prefixes, no Co-Authored-By | Each task's commit message; verified Task 12 |

No gaps.

**Type consistency:**

- `User`, `Group`, `Config` — defined in Task 3, used in Tasks 4 and 6. Same field names throughout (`uid`, `cn`, `sn`, `mail`, `password`, `groups`).
- `upsert_group`, `upsert_user`, `delete_entry` — defined in Task 4, called in Tasks 4 (tests) and 6 (main).
- `ensure_realm`, `ensure_ldap_federation`, `ensure_group_mapper` — defined in Task 5, called in Task 6.
- Env vars: `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_ADMIN_DN`, `LDAP_ADMIN_PASSWORD`, `KC_URL`, `KC_ADMIN_USER`, `KC_ADMIN_PASSWORD`, `KC_REALM` — consistent in conftest, main, docker-compose.

**Placeholder scan:** None — all code, paths, and commands are concrete.

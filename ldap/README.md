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

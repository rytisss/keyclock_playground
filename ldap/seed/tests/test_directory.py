import os

from keycloak import KeycloakAdmin
from ldap3 import Connection, Server


def test_seeded_user_present_in_ldap(ldap_conn, base_dn):
    ldap_conn.search(f"ou=people,{base_dn}", "(uid=rytis)", attributes=["mail"])
    assert len(ldap_conn.entries) == 1
    assert ldap_conn.entries[0]["mail"].value == "rytis@cvdlink.local"


def test_all_seeded_users_present(ldap_conn, base_dn):
    """Every user from users.yaml must be in the directory."""
    for uid in ("rytis", "katie", "michael", "marek", "sienna"):
        ldap_conn.search(f"ou=people,{base_dn}", f"(uid={uid})", attributes=["uid"])
        assert len(ldap_conn.entries) == 1, f"{uid} missing from LDAP"


def test_seeded_user_can_bind(base_dn):
    server = Server(os.environ["LDAP_URL"])
    conn = Connection(
        server,
        user=f"uid=rytis,ou=people,{base_dn}",
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
    users = admin.get_users({"username": "rytis"})
    assert any(u["username"] == "rytis" for u in users), "rytis not federated into Keycloak"


def test_group_membership(ldap_conn, base_dn):
    """rytis belongs to admins (single group)."""
    ldap_conn.search(
        f"cn=admins,ou=groups,{base_dn}",
        "(objectClass=groupOfNames)",
        attributes=["member"],
    )
    assert len(ldap_conn.entries) == 1
    members = ldap_conn.entries[0]["member"].values
    assert f"uid=rytis,ou=people,{base_dn}" in members

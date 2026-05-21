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

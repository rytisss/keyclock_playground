import os

import jwt
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient

load_dotenv()

PORT = int(os.environ.get("PORT", "3001"))
KC_ISSUER = os.environ.get("KC_ISSUER", "http://localhost:8081/realms/cvdlink")
KC_JWKS_URI = os.environ.get("KC_JWKS_URI", f"{KC_ISSUER}/protocol/openid-connect/certs")

jwks_client = PyJWKClient(KC_JWKS_URI)


def verify(token: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        issuer=KC_ISSUER,
        # audience="python-api",  # enable once you've added an Audience mapper in Keycloak
        options={"verify_aud": False},
    )


def require_auth(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"error": "missing bearer token"})
    token = authorization[len("Bearer "):]
    try:
        return verify(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail={"error": "invalid token", "detail": str(exc)})


def require_role(role: str):
    def _checker(user: dict = Depends(require_auth)) -> dict:
        roles = (user.get("realm_access") or {}).get("roles") or []
        if role not in roles:
            raise HTTPException(status_code=403, detail={"error": f"requires role: {role}"})
        return user
    return _checker


app = FastAPI(title="CVDLINK Playground — Python API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/public")
def public():
    return {"message": "anyone can read this"}


@app.get("/protected")
def protected(user: dict = Depends(require_auth)):
    return {
        "message": "you are authenticated",
        "sub": user.get("sub"),
        "preferred_username": user.get("preferred_username"),
        "roles": (user.get("realm_access") or {}).get("roles", []),
    }


@app.get("/admin")
def admin(user: dict = Depends(require_role("admin"))):
    return {
        "message": "you are an admin",
        "user": user.get("preferred_username"),
    }


if __name__ == "__main__":
    print(f"API listening on http://localhost:{PORT}")
    print(f"Verifying JWTs from: {KC_ISSUER}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT)

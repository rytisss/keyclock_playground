import express from "express";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = process.env.PORT || 3001;
const KC_ISSUER = process.env.KC_ISSUER || "http://localhost:8081/realms/playground";
const KC_JWKS_URI = process.env.KC_JWKS_URI || `${KC_ISSUER}/protocol/openid-connect/certs`;

const JWKS = createRemoteJWKSet(new URL(KC_JWKS_URI));

async function verify(token) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: KC_ISSUER,
    // audience: "node-api",  // enable once you've added an Audience mapper in Keycloak
  });
  return payload;
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  verify(token)
    .then((payload) => { req.user = payload; next(); })
    .catch((err) => res.status(401).json({ error: "invalid token", detail: err.message }));
}

function requireRole(role) {
  return (req, res, next) => {
    const roles = req.user?.realm_access?.roles || [];
    if (!roles.includes(role)) return res.status(403).json({ error: `requires role: ${role}` });
    next();
  };
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/public", (_req, res) => {
  res.json({ message: "anyone can read this" });
});

app.get("/protected", requireAuth, (req, res) => {
  res.json({
    message: "you are authenticated",
    sub: req.user.sub,
    preferred_username: req.user.preferred_username,
    roles: req.user.realm_access?.roles ?? [],
  });
});

app.get("/admin", requireAuth, requireRole("admin"), (req, res) => {
  res.json({
    message: "you are an admin",
    user: req.user.preferred_username,
  });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`Verifying JWTs from: ${KC_ISSUER}`);
});

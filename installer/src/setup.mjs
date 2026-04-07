import { randomBytes } from "node:crypto";
import { SECRETS, readJson, writeJson } from "./paths.mjs";
import { info } from "./log.mjs";

function randomPassword() {
  // 32 bytes → 43-char base64url, plenty strong, no special-char escaping pain
  return randomBytes(32).toString("base64url");
}

function randomEmail() {
  const slug = randomBytes(4).toString("hex");
  return `admin-${slug}@metabase.local`;
}

async function getSetupToken(baseUrl) {
  const r = await fetch(`${baseUrl}/api/session/properties`);
  if (!r.ok) throw new Error(`/api/session/properties → ${r.status}`);
  const j = await r.json();
  return j["setup-token"] ?? null;
}

export async function completeFirstRun(baseUrl) {
  const existing = await readJson(SECRETS);
  const token = await getSetupToken(baseUrl);

  if (!token) {
    if (existing) {
      info("Metabase already set up; reusing stored credentials.");
      return existing;
    }
    throw new Error(
      "Metabase reports it is already set up, but no local credentials are saved. " +
      "Delete ~/.metabase-mcpb/ (or stop the existing Metabase) and re-run."
    );
  }

  const email = randomEmail();
  const password = randomPassword();
  info(`Completing first-run setup as ${email} ...`);

  const body = {
    token,
    user: {
      email,
      password,
      password_confirm: password,
      first_name: "Metabase",
      last_name: "Admin",
      site_name: "Metabase (mcpb)",
    },
    prefs: {
      site_name: "Metabase (mcpb)",
      site_locale: "en",
    },
  };

  const r = await fetch(`${baseUrl}/api/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`/api/setup → ${r.status} ${txt}`);
  }
  const j = await r.json().catch(() => ({}));
  const sessionToken = j.id || j["session-id"] || j.session || null;

  const creds = { email, password, sessionToken, createdAt: new Date().toISOString() };
  await writeJson(SECRETS, creds, { secret: true });
  return creds;
}

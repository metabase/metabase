/**
 * Idempotent setup for runs WITHOUT a corpus manifest (e.g. smoke runs against an existing instance).
 * With a manifest, corpus-gen/apply.ts has already created the harness user; this is a no-op.
 *
 *   node src/setup.ts [--config …] [--base-url …]
 *
 * Ensures the configured `user` exists, can log in with the configured password, and is not a superuser.
 * It deliberately does NOT enable engines: `additional-search-engines` is an internal setting the API refuses to
 * write, so it has to come from MB_ADDITIONAL_SEARCH_ENGINES at boot. Preflight reports a missing engine.
 */
import { MetabaseSession } from "./adapter.ts";
import { isMain, loadConfig, type RunnerConfig } from "./config.ts";

async function canLogIn(cfg: RunnerConfig) {
  const res = await fetch(`${cfg.baseUrl}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg.user),
  });
  return res.ok;
}

export async function setup(cfg: RunnerConfig): Promise<{ userId: number; actions: string[] }> {
  const actions: string[] = [];
  const admin = new MetabaseSession(cfg.baseUrl, cfg.admin);
  const email = cfg.user.username;

  const { data } = await admin.get<{ data: any[] }>("/api/user", { query: email });
  let user = data.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    const { status, body } = await admin.request("POST", "/api/user", {
      body: { first_name: "Harness", last_name: "Runner", email, password: cfg.user.password },
    });
    if (status !== 200) throw new Error(`creating ${email} failed: HTTP ${status} ${JSON.stringify(body)}`);
    user = body;
    actions.push(`created user ${email} (id ${user.id})`);
  }
  if (user.is_superuser) {
    const { status } = await admin.request("PUT", `/api/user/${user.id}`, { body: { is_superuser: false } });
    if (status !== 200) throw new Error(`could not revoke superuser from ${email}: HTTP ${status}`);
    actions.push(`revoked superuser from ${email}`);
  }
  if (!(await canLogIn(cfg))) {
    const { status } = await admin.request("PUT", `/api/user/${user.id}/password`, {
      body: { password: cfg.user.password },
    });
    if (status !== 200) throw new Error(`could not reset password for ${email}: HTTP ${status}`);
    actions.push(`reset password for ${email}`);
  }
  return { userId: user.id, actions };
}

if (isMain(import.meta.url)) {
  const cfg = loadConfig();
  if (cfg.manifest) {
    console.log(`manifest given (${cfg.manifest}); harness user comes from it, nothing to set up`);
  } else {
    const { userId, actions } = await setup(cfg);
    console.log(actions.length ? actions.join("\n") : `user ${cfg.user.username} (id ${userId}) already set up`);
  }
}

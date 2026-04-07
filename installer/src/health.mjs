import { info } from "./log.mjs";

export async function waitForHealth(baseUrl, { timeoutMs = 180_000 } = {}) {
  const url = `${baseUrl}/api/health`;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j.status === "ok") return;
      }
    } catch {}
    if (attempt % 10 === 0) info(`still waiting for ${url} ...`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Metabase did not become healthy at ${url} within ${timeoutMs}ms`);
}

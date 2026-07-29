/**
 * Dev server for the email template preview tool.
 *
 *     bun run email-dev            # serves on :8455 and opens the browser
 *     PORT=9000 bun run email-dev
 *
 * Serves dev/email-preview/index.html, exposes the list of templates at
 * /templates.json, and serves the .hbs files themselves so the page can
 * fetch (and live-reload) them.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PREVIEW_DIR = `${REPO_ROOT}dev/email-preview/`;
const TEMPLATE_DIR = `${REPO_ROOT}src/metabase/channel/email/`;
const PORT = Number(process.env.PORT || 8455);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    if (pathname.includes("..")) {
      return new Response("bad path", { status: 400 });
    }
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(Bun.file(`${PREVIEW_DIR}index.html`));
    }
    if (pathname === "/sample-contexts.js") {
      return new Response(Bun.file(`${PREVIEW_DIR}sample-contexts.js`));
    }
    if (pathname === "/templates.json") {
      const names = (await readdir(TEMPLATE_DIR))
        .filter((f) => f.endsWith(".hbs"))
        .map((f) => f.replace(/\.hbs$/, ""))
        .sort();
      return Response.json(names);
    }
    // .hbs sources, fetched by the page as /src/metabase/channel/email/<name>.hbs
    const file = Bun.file(REPO_ROOT + pathname.slice(1));
    if (await file.exists()) {
      return new Response(file, {
        headers: { "cache-control": "no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

const url = `http://localhost:${server.port}/`;
console.log(`📧 Email template preview → ${url}`);
console.log(`   Templates: src/metabase/channel/email/*.hbs (edits reload live)`);

if (!process.env.EMAIL_DEV_NO_OPEN) {
  const opener =
    process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
}

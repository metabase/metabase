/* eslint-env node */
/* eslint-disable no-console -- printing the result is what this script is for */

/**
 * Serves a built `resources/frontend_client` tree the way the backend does, so
 * a bundle can be loaded in a browser without running Metabase.
 *
 * The index template's placeholders are filled in, hashed assets are immutable
 * so a second visit reuses them, and a `.br` beside a file is served when the
 * client accepts it. API calls answer `{}`. The app fails to render on that, and
 * that is fine: every number this harness reports lands before the first API
 * response matters.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = process.argv[2];
const port = Number(process.argv[3] || 8099);

if (!root) {
  console.error("usage: node serve.js <resources/frontend_client dir> [port]");
  process.exit(1);
}

const BOOTSTRAP = JSON.stringify({
  "site-locale": "en",
  "available-locales": [["en", "English"]],
  "token-features": {},
  version: { tag: "bench" },
});

const TEMPLATE_VALUES = {
  language: "en",
  baseHref: "/",
  uri: "/",
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- the template wants the default app name
  applicationName: "Metabase",
  favicon: "app/assets/img/favicon.ico",
  embedCode: "",
  routePreloads: "",
  bootstrapJSON: BOOTSTRAP,
  userLocalizationJSON: "{}",
  siteLocalizationJSON: "{}",
  userColorScheme: '"light"',
  nonceJSON: '""',
  bootstrapJS: "",
  assetOnErrorJS: "",
};

const CONTENT_TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const IMMUTABLE = "public, max-age=31536000, immutable";

function serveTemplate(file, res) {
  const html = Object.entries(TEMPLATE_VALUES).reduce(
    (result, [key, value]) => result.replaceAll(`{{{${key}}}}`, value),
    fs.readFileSync(file, "utf8"),
  );

  res.writeHead(200, {
    "content-type": "text/html",
    "cache-control": "no-store",
  });
  res.end(html);
}

http
  .createServer((req, res) => {
    const url = req.url.split("?")[0];

    if (url.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
      return;
    }

    const relative = url === "/" ? "/index.html" : url;
    const file = path.join(root, relative);

    if (relative === "/index.html") {
      serveTemplate(file, res);
      return;
    }

    const contentType =
      CONTENT_TYPES[path.extname(relative)] || "application/octet-stream";
    const acceptsBrotli = (req.headers["accept-encoding"] || "").includes("br");

    if (acceptsBrotli && fs.existsSync(`${file}.br`)) {
      res.writeHead(200, {
        "content-type": contentType,
        "content-encoding": "br",
        "cache-control": IMMUTABLE,
      });
      res.end(fs.readFileSync(`${file}.br`));
      return;
    }

    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": IMMUTABLE,
    });
    res.end(fs.readFileSync(file));
  })
  .listen(port, () =>
    console.log(`serving ${root} on http://127.0.0.1:${port}`),
  );

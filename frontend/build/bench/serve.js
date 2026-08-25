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

/**
 * `off`, `low` or `high`. The backend emits these hints with
 * `fetchpriority="low"`; the other two are here so the choice can be measured
 * rather than argued.
 */
const preloadPriority = process.env.PRELOAD_PRIORITY || "low";

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

/** The manifest the build emits, if this tree has one. */
function loadManifest() {
  const file = path.join(root, "app/dist/route-preloads.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
}

/**
 * The backend matches these patterns with clout. This is the same shape: `:name`
 * takes one segment and `*` takes the rest.
 */
function matches(pattern, urlPath) {
  const source = pattern
    .split("/")
    .map((segment) => {
      if (segment === "*") {
        return "(?:.*)";
      }
      if (segment.startsWith(":")) {
        return "[^/]+";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${source}$`).test(urlPath);
}

function preloadTags(urlPath) {
  if (preloadPriority === "off") {
    return "";
  }

  const entry = loadManifest().find((row) =>
    row.patterns.some((pattern) => matches(pattern, urlPath)),
  );
  if (!entry) {
    return "";
  }

  return entry.files
    .map((file) => {
      const as = file.endsWith(".css") ? "style" : "script";
      const priority =
        preloadPriority === "high" ? "" : ` fetchpriority="${preloadPriority}"`;
      return `<link rel="preload" href="${file}" as="${as}"${priority}>`;
    })
    .join("");
}

function serveTemplate(file, res, urlPath) {
  const values = { ...TEMPLATE_VALUES, routePreloads: preloadTags(urlPath) };
  const html = Object.entries(values).reduce(
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

    const relative = url.startsWith("/app/") ? url : "/index.html";
    const file = path.join(root, relative);

    if (relative === "/index.html") {
      serveTemplate(file, res, url);
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

// Guards the transitive *runtime* import closure of the embed.js script tag.
//
// The module-boundaries eslint rules only check direct imports, and the
// script module is app tier so they don't restrict its outgoing edges at
// all. But embed.js runs on customer pages: it must stay lean and must not
// pull in app code. This check bundles the script's entry points with
// esbuild (in memory, nothing written) and fails if any source file outside
// the allowlist below ends up in the bundle. `import type` never reaches
// the bundle, so type-only contracts with the sdk bundle are fine.
//
// Run with: bun run lint-embed-js-purity

/* global console, process */

import { build } from "esbuild";

const ENTRY_POINTS = [
  "frontend/src/metabase/embedding/embedding-iframe-sdk/script/embed.ts",
  // The EE side of the script. The embed.js rspack build resolves the
  // sdk-iframe-embedding-script-ee-plugins alias to this file (tsconfig
  // maps it to a noop, so it needs to be its own entry point here).
  "enterprise/frontend/src/metabase-enterprise/sdk-iframe-embedding-script-plugins.ts",
];

const ALLOWED_RUNTIME_CLOSURE = [
  // the script-tag module itself (app/embedding-iframe-sdk-script)
  /^frontend\/src\/metabase\/embedding\/embedding-iframe-sdk\/script\//,
  // error classes shared with the sdk: self-contained, no onward imports
  /^frontend\/src\/embedding-sdk-shared\/errors\//,
  // lib tier, restricted to lib-only imports by module-boundaries
  /^frontend\/src\/metabase\/utils\//,
  // what the ee-plugins alias resolves to in OSS builds
  /^frontend\/src\/metabase\/plugins\/noop\.ts$/,
  // EE side of the script (app/embedding-iframe-sdk-script-ee) + SSO helpers
  /^enterprise\/frontend\/src\/embedding\/auth-common\//,
  /^enterprise\/frontend\/src\/metabase-enterprise\/sdk-iframe-embedding-script-plugins\.ts$/,
  /^enterprise\/frontend\/src\/metabase-enterprise\/embedding_iframe_sdk\/sdk-iframe-embedding-script-ee-plugins\.ts$/,
  /^enterprise\/frontend\/src\/metabase-enterprise\/embedding_iframe_sdk\/auth-manager\//,
];

// Aliases from tsconfig paths that map to our own source files. Anything
// else that looks like a package import is externalized without resolving,
// so node_modules never enter the bundle (their size is not this check's
// concern).
const SOURCE_ALIAS_PREFIXES = [
  "metabase",
  "metabase-lib",
  "metabase-types",
  "metabase-enterprise",
  "embedding",
  "embedding-sdk-bundle",
  "embedding-sdk-shared",
  "embedding-sdk-package",
  "sdk-iframe-embedding-script-ee-plugins",
  "sdk-iframe-embedding-ee-plugins",
  "sdk-ee-plugins",
  "ee-plugins",
  "ee-overrides",
  "cljs",
];

const externalizeNodeModules = {
  name: "externalize-node-modules",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
      const isSourceAlias = SOURCE_ALIAS_PREFIXES.some(
        (prefix) => args.path === prefix || args.path.startsWith(`${prefix}/`),
      );
      return isSourceAlias ? null : { path: args.path, external: true };
    });
  },
};

const result = await build({
  entryPoints: ENTRY_POINTS,
  bundle: true,
  write: false,
  metafile: true,
  platform: "browser",
  tsconfig: "tsconfig.json",
  logLevel: "silent",
  outdir: "unused-in-memory-outdir",
  plugins: [externalizeNodeModules],
});

const bundledSources = Object.keys(result.metafile.inputs);
const violations = bundledSources.filter(
  (file) => !ALLOWED_RUNTIME_CLOSURE.some((pattern) => pattern.test(file)),
);

if (violations.length > 0) {
  console.error(
    "✖ embed.js must stay lean: it runs on customer pages and must not pull in app code.",
  );
  console.error(
    "  These files would end up in the embed.js bundle but are not in the allowlist:\n",
  );
  for (const file of violations) {
    console.error(`  - ${file}`);
  }
  console.error(
    "\n  If a dependency is intentional, add it to the allowlist in frontend/lint/embed-js-purity.mjs",
  );
  console.error("  and make sure its own imports keep the closure small.");
  process.exit(1);
}

console.log(
  `✔ embed.js runtime closure is clean (${bundledSources.length} source files)`,
);

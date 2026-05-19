const fs = require("fs");
const path = require("path");

const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "../..");
const CLJS_DIR = path.join(ROOT, "target/cljs_dev");
const OUT_DIR = path.join(ROOT, "target/cljs_jest");
const ENTRIES_DIR = path.join(OUT_DIR, "entries");
const BUNDLES_DIR = path.join(OUT_DIR, "bundles");
const PROXIES_DIR = path.join(OUT_DIR, "proxies");

const SOURCE_DIRS = [
  "frontend/src",
  "frontend/test",
  "enterprise/frontend/src",
].map((dir) => path.join(ROOT, dir));

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const CLJS_CLUSTERS = {
  lib: [
    "metabase.lib.js",
    "metabase.lib.limit",
    "metabase.lib.types.isa",
    "metabase.lib_metric.js",
  ],
  parameters: ["metabase.parameters.shared"],
  types: ["metabase.types.core"],
  pivot: ["metabase.pivot.js"],
  small: [
    "metabase.dashboards.constants",
    "metabase.transforms_inspector.js",
    "metabase.util.currency",
    "metabase.xrays.domain_entities.queries.util",
  ],
};

function assertCljsBuildExists() {
  if (!fs.existsSync(path.join(CLJS_DIR, "cljs.core.js"))) {
    throw new Error(
      `[build-cljs-jest-bundle] CLJS bundle not found at ${CLJS_DIR}.\n` +
        "Run `bun run build:cljs` before bundling CLJS for Jest.",
    );
  }
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "target" ||
        entry.name === "__snapshots__"
      ) {
        continue;
      }
      walk(entryPath, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectCljsSpecifiers() {
  const specifiers = new Set();
  const importExportPattern =
    /\b(?:import|export)\s+(?!type\b)(?:[^"'`]*?\s+from\s*)?["']cljs\/([^"']+)["']/g;
  const requirePattern = /\brequire\(\s*["']cljs\/([^"']+)["']\s*\)/g;

  for (const dir of SOURCE_DIRS) {
    for (const file of walk(dir)) {
      const contents = fs.readFileSync(file, "utf8");

      for (const match of contents.matchAll(importExportPattern)) {
        specifiers.add(match[1]);
      }
      for (const match of contents.matchAll(requirePattern)) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers].sort();
}

function cljsFileForSpecifier(specifier) {
  return path.join(CLJS_DIR, `${specifier}.js`);
}

function proxyFileForSpecifier(specifier) {
  return path.join(PROXIES_DIR, `${specifier}.js`);
}

function clusterForSpecifier(specifier, clusterAssignments) {
  return clusterAssignments.get(specifier);
}

function getClusterAssignments() {
  const assignments = new Map();

  for (const [clusterName, specifiers] of Object.entries(CLJS_CLUSTERS)) {
    for (const specifier of specifiers) {
      if (assignments.has(specifier)) {
        throw new Error(
          `[build-cljs-jest-bundle] cljs/${specifier} is assigned to both ` +
            `${assignments.get(specifier)} and ${clusterName}.`,
        );
      }
      assignments.set(specifier, clusterName);
    }
  }

  return assignments;
}

function groupSpecifiersByCluster(specifiers) {
  const clusterAssignments = getClusterAssignments();
  const unassignedSpecifiers = specifiers.filter(
    (specifier) => !clusterForSpecifier(specifier, clusterAssignments),
  );

  if (unassignedSpecifiers.length > 0) {
    throw new Error(
      "[build-cljs-jest-bundle] Found cljs/* imports without a bundle cluster:\n" +
        unassignedSpecifiers
          .map((specifier) => `  cljs/${specifier}`)
          .join("\n") +
        "\nAdd each specifier to CLJS_CLUSTERS in this script.",
    );
  }

  const groupedSpecifiers = new Map();
  for (const specifier of specifiers) {
    const clusterName = clusterForSpecifier(specifier, clusterAssignments);
    if (!groupedSpecifiers.has(clusterName)) {
      groupedSpecifiers.set(clusterName, []);
    }
    groupedSpecifiers.get(clusterName).push(specifier);
  }

  return groupedSpecifiers;
}

function bundleFileForCluster(clusterName) {
  return path.join(BUNDLES_DIR, `${clusterName}.js`);
}

function entryFileForCluster(clusterName) {
  return path.join(ENTRIES_DIR, `${clusterName}.cjs`);
}

function relativeRequirePath(fromFile, toFile) {
  const relativePath = path.relative(path.dirname(fromFile), toFile);
  return relativePath.startsWith(".")
    ? relativePath.replaceAll(path.sep, "/")
    : `./${relativePath.replaceAll(path.sep, "/")}`;
}

function fileSizeInMb(file) {
  return fs.statSync(file).size / 1024 / 1024;
}

function directorySizeInBytes(dir) {
  let size = 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    size += entry.isDirectory()
      ? directorySizeInBytes(entryPath)
      : fs.statSync(entryPath).size;
  }

  return size;
}

function writeGeneratedFiles(groupedSpecifiers) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(ENTRIES_DIR, { recursive: true });
  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  fs.mkdirSync(PROXIES_DIR, { recursive: true });

  const specifiers = [...groupedSpecifiers.values()].flat();
  const missingFiles = specifiers.filter((specifier) => {
    return !fs.existsSync(cljsFileForSpecifier(specifier));
  });
  if (missingFiles.length > 0) {
    throw new Error(
      "[build-cljs-jest-bundle] Missing compiled CLJS entry files:\n" +
        missingFiles
          .map((specifier) => `  cljs/${specifier} -> ${specifier}.js`)
          .join("\n"),
    );
  }

  for (const [clusterName, clusterSpecifiers] of groupedSpecifiers) {
    const entryContents = [
      "export default {",
      ...clusterSpecifiers.map(
        (specifier) =>
          `  ${JSON.stringify(specifier)}: require(${JSON.stringify(
            cljsFileForSpecifier(specifier),
          )}),`,
      ),
      "};",
      "",
    ].join("\n");

    fs.writeFileSync(entryFileForCluster(clusterName), entryContents);

    for (const specifier of clusterSpecifiers) {
      const proxyFile = proxyFileForSpecifier(specifier);
      const bundleFile = bundleFileForCluster(clusterName);
      fs.mkdirSync(path.dirname(proxyFile), { recursive: true });
      fs.writeFileSync(
        proxyFile,
        [
          "/* eslint-disable import/no-commonjs */",
          `const cljsBundle = require(${JSON.stringify(
            relativeRequirePath(proxyFile, bundleFile),
          )});`,
          `module.exports = cljsBundle.default[${JSON.stringify(specifier)}];`,
          "",
        ].join("\n"),
      );
    }
  }
}

async function bundleClusters(groupedSpecifiers) {
  const entryPoints = {};
  for (const clusterName of groupedSpecifiers.keys()) {
    entryPoints[clusterName] = entryFileForCluster(clusterName);
  }

  await esbuild.build({
    entryPoints,
    bundle: true,
    platform: "node",
    format: "esm",
    splitting: true,
    outdir: BUNDLES_DIR,
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    packages: "external",
    tsconfigRaw: "{}",
    legalComments: "none",
    logLevel: "warning",
  });
}

async function main() {
  assertCljsBuildExists();

  const specifiers = collectCljsSpecifiers();
  if (specifiers.length === 0) {
    throw new Error("[build-cljs-jest-bundle] No runtime cljs/* imports found.");
  }

  const groupedSpecifiers = groupSpecifiersByCluster(specifiers);
  writeGeneratedFiles(groupedSpecifiers);
  await bundleClusters(groupedSpecifiers);

  const bundleSummary = [...groupedSpecifiers]
    .map(([clusterName, clusterSpecifiers]) => {
      const sizeInMb = fileSizeInMb(bundleFileForCluster(clusterName));
      return `${clusterName}:${clusterSpecifiers.length} ` +
        `(${sizeInMb.toFixed(1)} MB entry)`;
    })
    .join(", ");
  const totalSizeInMb = directorySizeInBytes(BUNDLES_DIR) / 1024 / 1024;

  console.log(
    `[build-cljs-jest-bundle] bundled ${specifiers.length} cljs/* entries ` +
      `into ${groupedSpecifiers.size} clusters ` +
      `(${totalSizeInMb.toFixed(1)} MB total): ${bundleSummary}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

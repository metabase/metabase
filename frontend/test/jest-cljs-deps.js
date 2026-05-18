const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const SCAN_ROOTS = ["frontend/src", "frontend/test", "enterprise/frontend/src"];
const DEFAULT_TOP_LIMIT = 20;

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function toAbsolute(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function toRelative(absolutePath) {
  return toPosix(path.relative(REPO_ROOT, absolutePath));
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function directoryExists(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function resolveFile(basePath) {
  if (fileExists(basePath)) {
    return basePath;
  }

  for (const extension of EXTENSIONS) {
    const withExtension = `${basePath}${extension}`;
    if (fileExists(withExtension)) {
      return withExtension;
    }
  }

  if (directoryExists(basePath)) {
    for (const extension of EXTENSIONS) {
      const indexPath = path.join(basePath, `index${extension}`);
      if (fileExists(indexPath)) {
        return indexPath;
      }
    }
  }

  return null;
}

function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith("cljs/")) {
    return specifier;
  }

  if (specifier.startsWith(".")) {
    return resolveFile(path.resolve(path.dirname(fromFile), specifier));
  }

  const aliases = [
    ["metabase-lib", "frontend/src/metabase-lib"],
    ["metabase", "frontend/src/metabase"],
    ["embedding-sdk-bundle", "frontend/src/embedding-sdk-bundle"],
    ["__support__", "frontend/test/__support__"],
  ];

  for (const [alias, target] of aliases) {
    if (specifier === alias || specifier.startsWith(`${alias}/`)) {
      const suffix = specifier === alias ? "" : specifier.slice(alias.length);
      return resolveFile(toAbsolute(`${target}${suffix}`));
    }
  }

  return null;
}

function collectFiles(directory, files = []) {
  if (!directoryExists(directory)) {
    return files;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(entryPath, files);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function parseRuntimeImports(source) {
  const imports = [];
  const reexports = [];

  const importFromPattern = /^\s*import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm;
  for (const match of source.matchAll(importFromPattern)) {
    imports.push({ specifier: match[2], reexport: false });
  }

  const sideEffectImportPattern = /^\s*import\s+["']([^"']+)["'];?/gm;
  for (const match of source.matchAll(sideEffectImportPattern)) {
    imports.push({ specifier: match[1], reexport: false });
  }

  const exportFromPattern = /^\s*export\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm;
  for (const match of source.matchAll(exportFromPattern)) {
    imports.push({ specifier: match[2], reexport: true });
    reexports.push(match[2]);
  }

  const requirePattern = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(requirePattern)) {
    imports.push({ specifier: match[1], reexport: false });
  }

  return { imports, reexports };
}

function buildGraph(files) {
  const graph = new Map();
  const reverseGraph = new Map();
  const directCljsImporters = new Map();
  const rootMetabaseLibImporters = [];
  const reexportFiles = new Map();
  let runtimeEdges = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const { imports, reexports } = parseRuntimeImports(source);
    const deps = [];

    if (reexports.length > 0) {
      reexportFiles.set(file, reexports.length);
    }

    for (const runtimeImport of imports) {
      if (runtimeImport.specifier === "metabase-lib") {
        rootMetabaseLibImporters.push(file);
      }

      const resolved = resolveSpecifier(file, runtimeImport.specifier);
      if (!resolved) {
        continue;
      }

      deps.push(resolved);
      runtimeEdges += 1;

      if (!reverseGraph.has(resolved)) {
        reverseGraph.set(resolved, new Set());
      }
      reverseGraph.get(resolved).add(file);

      if (runtimeImport.specifier.startsWith("cljs/")) {
        directCljsImporters.set(file, runtimeImport.specifier);
      }
    }

    graph.set(file, deps);
  }

  return {
    graph,
    reverseGraph,
    directCljsImporters,
    rootMetabaseLibImporters,
    reexportFiles,
    runtimeEdges,
  };
}

function computeCljsDistances(reverseGraph, directCljsImporters) {
  const nextTowardCljs = new Map();
  const distance = new Map();
  const queue = [];

  for (const [file, cljsSpecifier] of directCljsImporters.entries()) {
    distance.set(file, 1);
    nextTowardCljs.set(file, cljsSpecifier);
    queue.push(file);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const importers = reverseGraph.get(current) ?? new Set();

    for (const importer of importers) {
      if (distance.has(importer)) {
        continue;
      }

      distance.set(importer, distance.get(current) + 1);
      nextTowardCljs.set(importer, current);
      queue.push(importer);
    }
  }

  return { distance, nextTowardCljs };
}

function pathToCljs(file, nextTowardCljs) {
  const importPath = [file];
  const seen = new Set([file]);
  let current = file;

  while (nextTowardCljs.has(current)) {
    current = nextTowardCljs.get(current);
    importPath.push(current);

    if (typeof current === "string" && current.startsWith("cljs/")) {
      return importPath;
    }

    if (seen.has(current)) {
      return importPath;
    }
    seen.add(current);
  }

  return importPath;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map, limit = 20) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([file, count]) => ({ file: normalizeReportPath(file), count }));
}

function parseArgs(argv) {
  const options = {
    top: DEFAULT_TOP_LIMIT,
    pathsFor: null,
    category: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--top") {
      options.top = Number(argv[++index]);
    } else if (arg === "--paths-for") {
      options.pathsFor = argv[++index];
    } else if (arg === "--category") {
      options.category = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.top) || options.top < 1) {
    throw new Error("--top must be a positive integer");
  }

  if (
    options.category &&
    !["unitSpecs", "productFiles", "supportFiles", "otherTestFiles"].includes(
      options.category,
    )
  ) {
    throw new Error(
      "--category must be one of unitSpecs, productFiles, supportFiles, otherTestFiles",
    );
  }

  return options;
}

function normalizeReportPath(value) {
  if (typeof value === "string" && path.isAbsolute(value)) {
    return toRelative(value);
  }
  return value;
}

function isUnitSpec(file) {
  return /\.(unit\.)?spec\.[jt]sx?$/.test(file) || /\.test\.[jt]sx?$/.test(file);
}

function classifyFile(file) {
  const relativePath = toRelative(file);
  if (isUnitSpec(relativePath)) {
    return "unitSpecs";
  }
  if (relativePath.startsWith("frontend/test/")) {
    return "supportFiles";
  }
  if (relativePath.includes("/test/") || relativePath.includes("/tests/")) {
    return "otherTestFiles";
  }
  return "productFiles";
}

function normalizeInputPath(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(REPO_ROOT, filePath);

  return resolveFile(absolutePath);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = SCAN_ROOTS.flatMap((root) => collectFiles(toAbsolute(root)));
  const unitSpecs = files.filter((file) => isUnitSpec(toRelative(file)));
  const selectedCategory = options.category ?? "unitSpecs";
  const selectedFiles = options.category
    ? files.filter((file) => classifyFile(file) === options.category)
    : unitSpecs;
  const {
    reverseGraph,
    directCljsImporters,
    rootMetabaseLibImporters,
    reexportFiles,
    runtimeEdges,
  } = buildGraph(files);
  const { distance, nextTowardCljs } = computeCljsDistances(
    reverseGraph,
    directCljsImporters,
  );

  const firstHops = new Map();
  const reexportFilesOnCljsPaths = new Map();
  const selectedPathsToCljs = [];

  for (const file of selectedFiles) {
    if (!distance.has(file)) {
      continue;
    }

    const importPath = pathToCljs(file, nextTowardCljs);
    selectedPathsToCljs.push(importPath);

    if (importPath[1]) {
      increment(firstHops, importPath[1]);
    }

    for (const file of importPath.slice(1, -1)) {
      if (reexportFiles.has(file) || path.basename(file).startsWith("index.")) {
        increment(reexportFilesOnCljsPaths, file);
      }
    }
  }

  const rootImportersByCategory = {
    unitSpecs: [],
    supportFiles: [],
    otherTestFiles: [],
    productFiles: [],
  };

  for (const file of rootMetabaseLibImporters.sort()) {
    rootImportersByCategory[classifyFile(file)].push(toRelative(file));
  }

  const topFirstHopsToCljs = topEntries(firstHops, options.top);
  const topBarrelOrReexportFilesOnCljsPaths = topEntries(
    reexportFilesOnCljsPaths,
    options.top,
  );

  const report = {
    totals: {
      filesScanned: files.length,
      runtimeEdges,
      directCljsImporters: directCljsImporters.size,
      unitSpecs: unitSpecs.length,
      unitSpecsWithRuntimePathToCljs:
        selectedCategory === "unitSpecs"
          ? selectedPathsToCljs.length
          : unitSpecs.filter((file) => distance.has(file)).length,
      selectedCategory,
      selectedFiles: selectedFiles.length,
      selectedFilesWithRuntimePathToCljs: selectedPathsToCljs.length,
      metabaseLibRootRuntimeImporters: rootMetabaseLibImporters.length,
      metabaseLibRootRuntimeImportingUnitSpecs:
        rootImportersByCategory.unitSpecs.length,
      metabaseLibRootRuntimeImportingSupportFiles:
        rootImportersByCategory.supportFiles.length,
      metabaseLibRootRuntimeImportingProductFiles:
        rootImportersByCategory.productFiles.length,
    },
    topFirstHopsToCljs,
    ...(selectedCategory === "unitSpecs"
      ? { topFirstHopsToCljsFromUnitSpecs: topFirstHopsToCljs }
      : {}),
    topDirectCljsImporters: topEntries(
      new Map(
        [...directCljsImporters.entries()].map(([file]) => [
          file,
          [...(reverseGraph.get(file) ?? [])].length,
        ]),
      ),
      options.top,
    ),
    topBarrelOrReexportFilesOnCljsPaths,
    metabaseLibRootRuntimeImporters: options.category
      ? {
          [options.category]: rootImportersByCategory[options.category],
        }
      : rootImportersByCategory,
  };

  report.shortestPathSamplesByTopFirstHop =
    report.topFirstHopsToCljs.map(({ file }) => {
      const absoluteFile = toAbsolute(file);
      const samplePath = selectedPathsToCljs.find(
        (importPath) => importPath[1] === absoluteFile,
      );

      return {
        file,
        path: samplePath?.map(normalizeReportPath) ?? [],
      };
    });

  if (options.pathsFor) {
    const file = normalizeInputPath(options.pathsFor);
    report.shortestPathFor = {
      file: options.pathsFor,
      path:
        file && distance.has(file)
          ? pathToCljs(file, nextTowardCljs).map(normalizeReportPath)
          : [],
    };
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();

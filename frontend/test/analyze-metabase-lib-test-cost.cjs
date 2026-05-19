#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_ROOTS = [
  path.join(ROOT, "frontend/src"),
  path.join(ROOT, "frontend/test"),
  path.join(ROOT, "enterprise/frontend/src"),
];

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".cjs"];
const UNIT_SPEC_RE = /\.unit\.spec\.(ts|tsx|js|jsx)$/;
const IMPORT_RE =
  /(?:import\s+(?!type\b)[\s\S]*?\s+from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|export\s+(?!type\b)[\s\S]*?\s+from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']\s*\))/g;

const CATEGORY_MATCHERS = {
  all: () => true,
  slow: () => true,
  queryBuilder: (file) => file.includes("/metabase/query_builder/"),
  dashboard: (file) => file.includes("/metabase/dashboard/"),
  visualizations: (file) => file.includes("/metabase/visualizations/"),
  public: (file) => file.includes("/metabase/public/"),
};

const HEAVY_TARGETS = [
  {
    label: "metabase-lib root barrel",
    match: (file) => file === "frontend/src/metabase-lib/index.ts",
  },
  {
    label: "metabase-lib query wrapper",
    match: (file) => file.startsWith("frontend/src/metabase-lib/query/"),
  },
  {
    label: "metabase-lib Question",
    match: (file) => file === "frontend/src/metabase-lib/v1/Question.ts",
  },
  {
    label: "metabase-lib v1 query helpers",
    match: (file) => file.startsWith("frontend/src/metabase-lib/v1/queries/"),
  },
  {
    label: "metabase-lib v1 parameter helpers",
    match: (file) => file.startsWith("frontend/src/metabase-lib/v1/parameters/"),
  },
  {
    label: "cljs/metabase.lib.js",
    matchImport: (specifier) => specifier === "cljs/metabase.lib.js",
  },
  {
    label: "cljs/metabase.lib_metric.js",
    matchImport: (specifier) => specifier === "cljs/metabase.lib_metric.js",
  },
];

const NARROW_TARGETS = [
  {
    label: "type constants",
    match: (file) =>
      file === "frontend/src/metabase-lib/v1/types/constants.ts",
  },
  {
    label: "type isa/predicates",
    match: (file) =>
      file === "frontend/src/metabase-lib/v1/types/utils/isa.ts",
  },
];

const FIRST_PRODUCT_ROOTS = [
  "frontend/src/",
  "enterprise/frontend/src/",
  "frontend/test/__support__/",
];

function parseArgs(argv) {
  const args = {
    category: "all",
    format: "table",
    top: 200,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--results":
        args.results = next;
        index += 1;
        break;
      case "--top":
        args.top = Number(next);
        index += 1;
        break;
      case "--category":
        args.category = next;
        index += 1;
        break;
      case "--format":
        args.format = next;
        index += 1;
        break;
      case "--json-output":
        args.jsonOutput = next;
        index += 1;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.results) {
    throw new Error("Missing required --results <jest-json-file>");
  }

  if (!Number.isFinite(args.top) || args.top <= 0) {
    throw new Error("--top must be a positive number");
  }

  if (!CATEGORY_MATCHERS[args.category]) {
    throw new Error(
      `Unknown --category '${args.category}'. Expected one of: ${Object.keys(
        CATEGORY_MATCHERS,
      ).join(", ")}`,
    );
  }

  if (!["table", "json"].includes(args.format)) {
    throw new Error("--format must be either 'table' or 'json'");
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node frontend/test/analyze-metabase-lib-test-cost.cjs --results /tmp/jest.json [options]

Options:
  --top N                       Number of slow suites to analyze. Default: 200
  --category NAME               all|slow|queryBuilder|dashboard|visualizations|public
  --format table|json           Print format. Default: table
  --json-output PATH            Also write the full JSON report to PATH
`);
}

function normalizePath(file) {
  return file.split(path.sep).join("/");
}

function relativeToRoot(file) {
  return normalizePath(path.relative(ROOT, file));
}

function readJestResults(resultsPath) {
  const absolutePath = path.resolve(resultsPath);
  const raw = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const testResults = raw.testResults || [];

  return testResults
    .map((result) => {
      const absoluteFile = path.resolve(result.name);
      const durationMs =
        result.perfStats?.runtime ??
        (result.endTime && result.startTime
          ? result.endTime - result.startTime
          : undefined);

      return {
        absoluteFile,
        file: relativeToRoot(absoluteFile),
        durationMs: durationMs || 0,
        status: result.status,
        assertionCount: result.assertionResults?.length || 0,
      };
    })
    .filter((result) => UNIT_SPEC_RE.test(result.file));
}

function collectSourceFiles() {
  const files = [];

  for (const root of SOURCE_ROOTS) {
    walk(root, files);
  }

  return new Set(files.map((file) => path.resolve(file)));
}

function walk(dir, files) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (
      entry.isDirectory() &&
      !["node_modules", ".git", "target", "dist", "build"].includes(entry.name)
    ) {
      walk(fullPath, files);
    } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
}

function buildGraph(files) {
  const graph = new Map();

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const imports = extractRuntimeImports(source);
    const edges = imports.map((specifier) => ({
      specifier,
      file: resolveSpecifier(file, specifier, files),
    }));

    graph.set(file, edges);
  }

  return graph;
}

function extractRuntimeImports(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const imports = [];

  IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_RE.exec(withoutComments)) !== null) {
    imports.push(match[1] || match[2] || match[3] || match[4]);
  }

  return imports;
}

function resolveSpecifier(fromFile, specifier, files) {
  if (specifier.startsWith(".")) {
    return resolveFile(path.resolve(path.dirname(fromFile), specifier), files);
  }

  const aliasBase = resolveAlias(specifier);
  if (aliasBase) {
    return resolveFile(aliasBase, files);
  }
}

function resolveAlias(specifier) {
  const aliases = [
    ["metabase-lib", "frontend/src/metabase-lib"],
    ["metabase", "frontend/src/metabase"],
    ["metabase-types", "frontend/src/metabase-types"],
    ["embedding-sdk-bundle", "frontend/src/embedding-sdk-bundle"],
    ["embedding-sdk-shared", "frontend/src/embedding-sdk-shared"],
    ["__support__", "frontend/test/__support__"],
    ["metabase-enterprise", "enterprise/frontend/src/metabase-enterprise"],
    ["embedding", "enterprise/frontend/src/embedding"],
  ];

  for (const [alias, target] of aliases) {
    if (specifier === alias) {
      return path.join(ROOT, target, "index");
    }

    if (specifier.startsWith(`${alias}/`)) {
      return path.join(ROOT, target, specifier.slice(alias.length + 1));
    }
  }
}

function resolveFile(basePath, files) {
  const candidates = [];

  if (path.extname(basePath)) {
    candidates.push(basePath);
  }

  for (const extension of EXTENSIONS) {
    candidates.push(`${basePath}${extension}`);
  }

  for (const extension of EXTENSIONS) {
    candidates.push(path.join(basePath, `index${extension}`));
  }

  return candidates.find((candidate) => files.has(path.resolve(candidate)));
}

function findShortestPath(startFile, graph, targetMatchers) {
  const queue = [{ file: startFile, path: [{ file: startFile }] }];
  const seen = new Set([startFile]);

  while (queue.length > 0) {
    const current = queue.shift();
    const relativeFile = relativeToRoot(current.file);

    for (const target of targetMatchers) {
      if (target.match?.(relativeFile)) {
        return {
          label: target.label,
          path: current.path,
        };
      }
    }

    for (const edge of graph.get(current.file) || []) {
      for (const target of targetMatchers) {
        if (target.matchImport?.(edge.specifier)) {
          return {
            label: target.label,
            path: [...current.path, { specifier: edge.specifier }],
          };
        }
      }

      if (edge.file && !seen.has(edge.file)) {
        seen.add(edge.file);
        queue.push({
          file: edge.file,
          path: [...current.path, { file: edge.file, specifier: edge.specifier }],
        });
      }
    }
  }
}

function findCljsEntries(startFile, graph) {
  const queue = [startFile];
  const seen = new Set([startFile]);
  const entries = new Set();

  while (queue.length > 0) {
    const file = queue.shift();

    for (const edge of graph.get(file) || []) {
      if (edge.specifier.startsWith("cljs/")) {
        entries.add(edge.specifier);
      }

      if (edge.file && !seen.has(edge.file)) {
        seen.add(edge.file);
        queue.push(edge.file);
      }
    }
  }

  return [...entries].sort();
}

function classify(spec, heavyPath, narrowPath, cljsEntries) {
  const text = `${spec.file}\n${formatPath(heavyPath?.path || [])}`.toLowerCase();
  const firstHop = heavyPath?.path?.[1]?.file
    ? relativeToRoot(heavyPath.path[1].file)
    : "";

  if (!heavyPath && narrowPath) {
    return narrowPath.label === "type constants"
      ? "type-predicates"
      : "type-predicates";
  }

  if (
    text.includes("/query_builder/") ||
    text.includes("metabase-lib/query/") ||
    text.includes("metabase-lib/v1/question") ||
    text.includes("normalize") ||
    text.includes("drill") ||
    cljsEntries.includes("cljs/metabase.lib.js")
  ) {
    return "query-semantics";
  }

  if (
    text.includes("/parameters/") ||
    text.includes("metabase-lib/v1/parameters/")
  ) {
    return "parameter-ui";
  }

  if (
    text.includes("display") ||
    text.includes("metadata") ||
    text.includes("column") ||
    firstHop.includes("/visualizations/")
  ) {
    return "display-metadata";
  }

  if (narrowPath) {
    return "type-predicates";
  }

  if (heavyPath) {
    return "ui-incidental";
  }

  return "unknown";
}

function getFirstProductModule(pathItems) {
  for (const item of pathItems.slice(1)) {
    if (!item.file) {
      continue;
    }

    const relativeFile = relativeToRoot(item.file);
    if (FIRST_PRODUCT_ROOTS.some((root) => relativeFile.startsWith(root))) {
      return relativeFile;
    }
  }
}

function formatPath(pathItems) {
  return pathItems
    .map((item, index) => {
      if (item.file) {
        const prefix = index === 0 ? "" : ` --${item.specifier || "import"}--> `;
        return `${prefix}${relativeToRoot(item.file)}`;
      }

      return ` --${item.specifier}--> <direct cljs import>`;
    })
    .join("\n");
}

function buildReport(args) {
  const files = collectSourceFiles();
  const graph = buildGraph(files);
  const categoryMatcher = CATEGORY_MATCHERS[args.category];
  const specs = readJestResults(args.results)
    .filter((spec) => categoryMatcher(spec.file))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, args.top);

  const rows = specs.map((spec) => {
    const startFile = path.resolve(ROOT, spec.file);
    const heavyPath = findShortestPath(startFile, graph, HEAVY_TARGETS);
    const narrowPath = findShortestPath(startFile, graph, NARROW_TARGETS);
    const cljsEntries = findCljsEntries(startFile, graph);
    const classification = classify(spec, heavyPath, narrowPath, cljsEntries);

    return {
      ...spec,
      durationSeconds: Number((spec.durationMs / 1000).toFixed(2)),
      classification,
      heavyTarget: heavyPath?.label,
      narrowTarget: narrowPath?.label,
      firstProductModule: getFirstProductModule(heavyPath?.path || []),
      cljsEntries,
      heavyPath: heavyPath ? formatPath(heavyPath.path) : undefined,
      narrowPath: narrowPath ? formatPath(narrowPath.path) : undefined,
    };
  });

  const summary = {
    results: path.resolve(args.results),
    category: args.category,
    analyzedSpecs: rows.length,
    specsWithHeavyMetabaseLibPath: rows.filter((row) => row.heavyTarget).length,
    specsWithNarrowTypePath: rows.filter((row) => row.narrowTarget).length,
    classifications: countBy(rows, (row) => row.classification),
    heavyTargets: countBy(
      rows.filter((row) => row.heavyTarget),
      (row) => row.heavyTarget,
    ),
    firstProductModules: topEntries(
      countBy(
        rows.filter((row) => row.firstProductModule),
        (row) => row.firstProductModule,
      ),
      20,
    ),
  };

  return { summary, rows };
}

function countBy(items, getKey) {
  const counts = {};

  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function topEntries(object, limit) {
  return Object.fromEntries(Object.entries(object).slice(0, limit));
}

function printTable(report) {
  console.log("Metabase-lib Jest cost report");
  console.log("");
  console.log(`Analyzed specs: ${report.summary.analyzedSpecs}`);
  console.log(
    `Heavy metabase-lib paths: ${report.summary.specsWithHeavyMetabaseLibPath}`,
  );
  console.log(`Narrow type paths: ${report.summary.specsWithNarrowTypePath}`);
  console.log("");
  console.log("Classifications:");
  for (const [name, count] of Object.entries(report.summary.classifications)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log("");
  console.log(
    [
      "seconds",
      "class",
      "heavy target",
      "first product/support module",
      "spec",
    ].join("\t"),
  );

  for (const row of report.rows) {
    console.log(
      [
        row.durationSeconds.toFixed(2),
        row.classification,
        row.heavyTarget || "-",
        row.firstProductModule || "-",
        row.file,
      ].join("\t"),
    );
  }
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const report = buildReport(args);

    if (args.jsonOutput) {
      fs.writeFileSync(
        path.resolve(args.jsonOutput),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    }

    if (args.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTable(report);
      if (args.jsonOutput) {
        console.log("");
        console.log(`JSON report written to ${path.resolve(args.jsonOutput)}`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();

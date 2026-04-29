const { elements, rules } = require("./module-boundaries");

// ---------------------------------------------------------------------------
// path → module mapping
// ---------------------------------------------------------------------------

function globToRegex(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  // Process ** before * so we don't double-replace.
  const placeholder = " DOUBLESTAR ";
  const withPlaceholder = escaped.replace(/\*\*/g, placeholder);
  const withSingleStar = withPlaceholder.replace(/\*/g, "[^/]*");
  return new RegExp(
    `^${withSingleStar.replace(new RegExp(placeholder, "g"), ".*")}$`,
  );
}

const compiledElements = elements.map((el) => ({
  type: el.type,
  regex: globToRegex(el.pattern),
}));

function fileToModule(path) {
  for (const el of compiledElements) {
    if (el.regex.test(path)) {
      return el.type;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// idealized affected-modules graph
// ---------------------------------------------------------------------------

const allTypes = elements.map((e) => e.type);

function expandPattern(pattern) {
  if (pattern === "*") {
    return [...allTypes];
  }
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return allTypes.filter((t) => t.startsWith(prefix));
  }
  return allTypes.includes(pattern) ? [pattern] : [];
}

// dependentsOf.get(M) = modules that may import M (per the rules)
const dependentsOf = new Map(allTypes.map((t) => [t, new Set()]));
for (const rule of rules) {
  const fromTypes = rule.from.flatMap(expandPattern);
  const allowTypes = rule.allow.flatMap(expandPattern);
  for (const target of allowTypes) {
    for (const importer of fromTypes) {
      if (importer !== target) {
        dependentsOf.get(target).add(importer);
      }
    }
  }
}

function directlyTouchedModules(changedFiles) {
  const direct = new Set();
  for (const file of changedFiles) {
    const m = fileToModule(file);
    if (m) {
      direct.add(m);
    }
  }
  return direct;
}

function affectedModules(changedFiles) {
  const direct = directlyTouchedModules(changedFiles);
  const affected = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const m = queue.shift();
    for (const dep of dependentsOf.get(m) ?? []) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push(dep);
      }
    }
  }
  return affected;
}

// ---------------------------------------------------------------------------
// test selection
// ---------------------------------------------------------------------------

function selectTests(affected, testFiles) {
  return testFiles.filter((f) => {
    const m = fileToModule(f);
    return m !== null && affected.has(m);
  });
}

// ---------------------------------------------------------------------------
// per-PR stats aggregator (pure)
// ---------------------------------------------------------------------------

function computeStats({ changedFiles, unitTestFiles, storyFiles }) {
  const direct = directlyTouchedModules(changedFiles);
  const affected = affectedModules(changedFiles);
  const unitToRun = selectTests(affected, unitTestFiles);
  const storiesToRun = selectTests(affected, storyFiles);
  return {
    modules_directly_touched: direct.size,
    modules_affected: affected.size,
    // Sorted so the value is stable across runs — matters for downstream
    // consumers that hash or diff these lists.
    affected_modules: [...affected].sort(),
    unit_tests_total: unitTestFiles.length,
    unit_tests_to_run: unitToRun.length,
    unit_tests_to_skip: unitTestFiles.length - unitToRun.length,
    loki_stories_total: storyFiles.length,
    loki_stories_to_run: storiesToRun.length,
    loki_stories_to_skip: storyFiles.length - storiesToRun.length,
  };
}

module.exports = {
  fileToModule,
  directlyTouchedModules,
  affectedModules,
  selectTests,
  computeStats,
};

/**
 * Compiles a glob pattern (supports `*` and `**`) to an anchored RegExp.
 */
function globToRegex(glob) {
  // Split on ** so single-segment expansion of * doesn't see them.
  const escapeSegment = (seg) =>
    seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  const body = glob.split("**").map(escapeSegment).join(".*");
  return new RegExp(`^${body}$`);
}

/**
 * Precomputes a module-graph value for a given (elements, rules) config.
 * Returns plain data; the helpers below take that value as their first arg.
 */
function buildModuleGraph(elements, rules) {
  const compiledElements = elements.map((el) => ({
    type: el.type,
    regex: globToRegex(el.pattern),
  }));

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

  // Inverse adjacency: dependentsOf.get(M) is the set of modules that may
  // import M (i.e. modules that need to be invalidated when M changes).
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

  return { compiledElements, dependentsOf };
}

/**
 * Returns the module type that owns the given file, or null if none matches.
 * First match wins, so element ordering matters for nested patterns.
 */
function fileToModule(graph, path) {
  for (const el of graph.compiledElements) {
    if (el.regex.test(path)) {
      return el.type;
    }
  }
  return null;
}

/**
 * Returns the set of module types containing any of the changed files.
 */
function directlyTouchedModules(graph, changedFiles) {
  const direct = new Set();
  for (const file of changedFiles) {
    const m = fileToModule(graph, file);
    if (m) {
      direct.add(m);
    }
  }
  return direct;
}

/**
 * Returns directly-touched modules plus the transitive closure of modules
 * that depend on them, i.e. everything potentially invalidated by the diff.
 */
function affectedModules(graph, changedFiles) {
  const direct = directlyTouchedModules(graph, changedFiles);
  const affected = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const m = queue.shift();
    for (const dep of graph.dependentsOf.get(m) ?? []) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push(dep);
      }
    }
  }
  return affected;
}

/**
 * Filters the test-file list down to tests whose owning module is affected.
 */
function selectTests(graph, affected, testFiles) {
  return testFiles.filter((f) => {
    const m = fileToModule(graph, f);
    return m !== null && affected.has(m);
  });
}

module.exports = {
  globToRegex,
  buildModuleGraph,
  fileToModule,
  directlyTouchedModules,
  affectedModules,
  selectTests,
};

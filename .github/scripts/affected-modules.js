/**
 * Compiles a glob pattern to an anchored RegExp.
 */
function globToRegex(glob) {
  const escapeSegment = (seg) =>
    seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  const body = glob.split("**").map(escapeSegment).join(".*");
  return new RegExp(`^${body}$`);
}

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
      return allTypes.filter((type) => type.startsWith(prefix));
    }
    return allTypes.includes(pattern) ? [pattern] : [];
  }

  // dependents.get(M) is the set of modules that depend on M
  // i.e. modules that are affected when M changes
  const dependents = new Map(allTypes.map((type) => [type, new Set()]));
  for (const rule of rules) {
    const fromTypes = rule.from.flatMap(expandPattern);
    const allowTypes = rule.allow.flatMap(expandPattern);
    for (const target of allowTypes) {
      for (const importer of fromTypes) {
        if (importer !== target) {
          dependents.get(target).add(importer);
        }
      }
    }
  }

  return { elements: compiledElements, dependents };
}

/**
 * Returns the module type that owns the given file.
 * First match wins, so element ordering matters for nested patterns.
 */
function mapFileToModule(moduleGraph, path) {
  for (const el of moduleGraph.elements) {
    if (el.regex.test(path)) {
      return el.type;
    }
  }
  return null;
}

/**
 * Returns the set of module types containing any of the changed files.
 */
function getChangedModules(moduleGraph, changedFiles) {
  const direct = new Set();
  for (const file of changedFiles) {
    const module = mapFileToModule(moduleGraph, file);
    if (module) {
      direct.add(module);
    }
  }
  return direct;
}

/**
 * Returns the changed modules and all modules that directly or indirectly depend on them
 */
function getAffectedModules(moduleGraph, changedFiles) {
  const direct = getChangedModules(moduleGraph, changedFiles);
  const affected = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const module = queue.shift();
    for (const dep of moduleGraph.dependents.get(module) ?? []) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push(dep);
      }
    }
  }
  return affected;
}

module.exports = {
  globToRegex,
  buildModuleGraph,
  mapFileToModule,
  getChangedModules,
  getAffectedModules,
};

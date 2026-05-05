function globToRegex(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  // Stash ** before expanding *, otherwise the second replace eats the first.
  const placeholder = " DOUBLESTAR ";
  const withPlaceholder = escaped.replace(/\*\*/g, placeholder);
  const withSingleStar = withPlaceholder.replace(/\*/g, "[^/]*");
  return new RegExp(
    `^${withSingleStar.replace(new RegExp(placeholder, "g"), ".*")}$`,
  );
}

/**
 * Builds the family of affected-tests functions against a given module config.
 * The factory shape lets tests pass an isolated fixture instead of binding to
 * frontend/lint/module-boundaries.js — config reshuffles can't break tests.
 */
function createAffectedTests(elements, rules) {
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

  function fileToModule(path) {
    for (const el of compiledElements) {
      if (el.regex.test(path)) {
        return el.type;
      }
    }
    return null;
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

  function selectTests(affected, testFiles) {
    return testFiles.filter((f) => {
      const m = fileToModule(f);
      return m !== null && affected.has(m);
    });
  }

  return {
    fileToModule,
    directlyTouchedModules,
    affectedModules,
    selectTests,
  };
}

module.exports = { createAffectedTests, globToRegex };

export type ModuleDef = { type: string; pattern: string };
export type Rule = { from: string[]; allow: string[] };

type ModuleNode = { type: string; regex: RegExp };

export type ModuleGraph = {
  nodes: ModuleNode[];
  dependents: Map<string, Set<string>>;
};

/**
 * Compiles a glob pattern to an anchored RegExp.
 */
export function globToRegex(glob: string): RegExp {
  const escapeSegment = (seg: string) =>
    seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  const body = glob.split("**").map(escapeSegment).join(".*");
  return new RegExp(`^${body}$`);
}

export function buildModuleGraph(
  elements: ModuleDef[],
  rules: Rule[],
): ModuleGraph {
  const nodes = elements.map((el) => ({
    type: el.type,
    regex: globToRegex(el.pattern),
  }));

  const allTypes = elements.map((e) => e.type);

  function expandPattern(pattern: string): string[] {
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
  const dependents = new Map<string, Set<string>>(
    allTypes.map((type) => [type, new Set()]),
  );
  for (const rule of rules) {
    const fromTypes = rule.from.flatMap(expandPattern);
    const allowTypes = rule.allow.flatMap(expandPattern);
    for (const target of allowTypes) {
      for (const importer of fromTypes) {
        if (importer !== target) {
          dependents.get(target)?.add(importer);
        }
      }
    }
  }

  return { nodes, dependents };
}

/**
 * Returns the module type that owns the given file.
 * First match wins, so element ordering matters for nested patterns.
 */
export function mapFileToModule(
  moduleGraph: ModuleGraph,
  path: string,
): string | null {
  for (const el of moduleGraph.nodes) {
    if (el.regex.test(path)) {
      return el.type;
    }
  }
  return null;
}

/**
 * Returns the set of module types containing any of the changed files.
 */
export function getChangedModules(
  moduleGraph: ModuleGraph,
  changedFiles: string[],
): Set<string> {
  const direct = new Set<string>();
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
export function getAffectedModules(
  moduleGraph: ModuleGraph,
  changedFiles: string[],
): Set<string> {
  const direct = getChangedModules(moduleGraph, changedFiles);
  const affected = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const module = queue.shift()!;
    for (const dep of moduleGraph.dependents.get(module) ?? []) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push(dep);
      }
    }
  }
  return affected;
}

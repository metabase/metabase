export type ModuleDef = { type: string; pattern: string };
export type Rule = { from: string[]; allow: string[] };

export type ModuleNode = { type: string; regex: RegExp };

export type FileDependency = { source: string; dependencies: string[] };

/**
 * Compiles a glob pattern to an anchored RegExp.
 */
function globToRegex(glob: string): RegExp {
  const escapeSegment = (seg: string) =>
    seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  const body = glob.split("**").map(escapeSegment).join(".*");
  return new RegExp(`^${body}$`);
}

/** First match wins, so element order matters for nested patterns. */
export function buildNodes(elements: ModuleDef[]): ModuleNode[] {
  return elements.map((el) => ({
    type: el.type,
    regex: globToRegex(el.pattern),
  }));
}

export function mapFileToModule(
  nodes: ModuleNode[],
  path: string,
): string | null {
  for (const node of nodes) {
    if (node.regex.test(path)) {
      return node.type;
    }
  }
  return null;
}

export function getChangedModules(
  nodes: ModuleNode[],
  changedFiles: string[],
): Set<string> {
  const direct = new Set<string>();
  for (const file of changedFiles) {
    const module = mapFileToModule(nodes, file);
    if (module) {
      direct.add(module);
    }
  }
  return direct;
}

export type FileGraph = {
  nodes: ModuleNode[];
  fileDependents: Map<string, Set<string>>;
};

/** Drops unresolvable imports (e.g. ambient types) that point at no real file. */
export function parseCruiseModules(
  modules: Array<{
    source: string;
    dependencies?: Array<{ resolved: string; couldNotResolve?: boolean }>;
  }>,
): FileDependency[] {
  return modules.map((module) => ({
    source: module.source,
    dependencies: (module.dependencies ?? [])
      .filter((dep) => !dep.couldNotResolve)
      .map((dep) => dep.resolved),
  }));
}

/** Inverts the import edges into the `fileDependents` reverse graph. */
export function buildFileGraph(
  elements: ModuleDef[],
  fileDependencies: FileDependency[],
): FileGraph {
  const fileDependents = new Map<string, Set<string>>();
  for (const { source, dependencies } of fileDependencies) {
    for (const target of dependencies) {
      let importers = fileDependents.get(target);
      if (!importers) {
        importers = new Set();
        fileDependents.set(target, importers);
      }
      importers.add(source);
    }
  }
  return { nodes: buildNodes(elements), fileDependents };
}

/** Changed files plus every file that transitively imports them. */
export function getAffectedFiles(
  fileGraph: FileGraph,
  changedFiles: string[],
): Set<string> {
  const affected = new Set(changedFiles);
  const queue = [...changedFiles];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const importer of fileGraph.fileDependents.get(file) ?? []) {
      if (!affected.has(importer)) {
        affected.add(importer);
        queue.push(importer);
      }
    }
  }
  return affected;
}

export type ModuleGraph = {
  nodes: ModuleNode[];
  /**
   * dependents.get(M) is every module affected when M changes — the full
   * transitive closure, so getAffectedModules only needs a single hop.
   */
  dependents: Map<string, Set<string>>;
};

/** Expands a direct-dependents map into its transitive closure. */
function transitiveClosure(
  direct: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const closure = new Map<string, Set<string>>();
  for (const start of direct.keys()) {
    const reached = new Set<string>();
    const queue = [...(direct.get(start) ?? [])];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (reached.has(node)) {
        continue;
      }
      reached.add(node);
      for (const next of direct.get(node) ?? []) {
        queue.push(next);
      }
    }
    reached.delete(start);
    closure.set(start, reached);
  }
  return closure;
}

/**
 * Builds a module graph from the actual import graph. Reachability is computed
 * per module at the file level and then collapsed to modules.
 */
export function buildUsageModuleGraph(
  elements: ModuleDef[],
  fileDependencies: FileDependency[],
): ModuleGraph {
  const nodes = buildNodes(elements);
  const fileGraph = buildFileGraph(elements, fileDependencies);

  const filesByModule = new Map<string, string[]>();
  const allFiles = new Set<string>();
  for (const { source, dependencies } of fileDependencies) {
    allFiles.add(source);
    for (const target of dependencies) {
      allFiles.add(target);
    }
  }
  for (const file of allFiles) {
    const module = mapFileToModule(nodes, file);
    if (module) {
      const files = filesByModule.get(module);
      if (files) {
        files.push(file);
      } else {
        filesByModule.set(module, [file]);
      }
    }
  }

  const dependents = new Map<string, Set<string>>(
    elements.map((el) => [el.type, new Set()]),
  );
  for (const [module, files] of filesByModule) {
    const affected = new Set<string>();
    for (const file of getAffectedFiles(fileGraph, files)) {
      const owner = mapFileToModule(nodes, file);
      if (owner && owner !== module) {
        affected.add(owner);
      }
    }
    dependents.set(module, affected);
  }

  return { nodes, dependents };
}

export function buildModuleGraph(
  elements: ModuleDef[],
  rules: Rule[],
): ModuleGraph {
  const nodes = buildNodes(elements);
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

  const directDependents = new Map<string, Set<string>>(
    allTypes.map((type) => [type, new Set()]),
  );
  for (const rule of rules) {
    const fromTypes = rule.from.flatMap(expandPattern);
    const allowTypes = rule.allow.flatMap(expandPattern);
    for (const target of allowTypes) {
      for (const importer of fromTypes) {
        if (importer !== target) {
          directDependents.get(target)?.add(importer);
        }
      }
    }
  }

  return { nodes, dependents: transitiveClosure(directDependents) };
}

/**
 * Returns the changed modules and all modules that directly or indirectly depend on them
 */
export function getAffectedModules(
  moduleGraph: ModuleGraph,
  changedFiles: string[],
): Set<string> {
  const affected = getChangedModules(moduleGraph.nodes, changedFiles);
  for (const module of [...affected]) {
    for (const dep of moduleGraph.dependents.get(module) ?? []) {
      affected.add(dep);
    }
  }
  return affected;
}

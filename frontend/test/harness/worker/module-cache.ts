// Node's CommonJS module cache: project modules leave it after each spec file
// so the next file evaluates them again, and packages stay.
import { createRequire } from "node:module";

import { isProjectSource } from "./project.ts";

type CachedModule = NodeJS.Module;
type CachedModules = Map<string, CachedModule>;

const require = createRequire(import.meta.url);

export function evictProjectModules(): void {
  evictModules(isProjectSource);
}

export function evictModules(shouldEvict: (file: string) => boolean): void {
  const evicted = new Set<CachedModule>();
  for (const [file, cached] of Object.entries(require.cache)) {
    if (cached && shouldEvict(file)) {
      evicted.add(cached);
      delete require.cache[file];
    }
  }
  releaseEvicted(evicted);
}

/**
 * Takes the project modules out of the cache and returns them, for
 * jest.isolateModules.
 */
export function takeProjectModules(): CachedModules {
  const taken: CachedModules = new Map();
  for (const [file, cached] of Object.entries(require.cache)) {
    if (cached && isProjectSource(file)) {
      taken.set(file, cached);
      delete require.cache[file];
    }
  }
  return taken;
}

export function putProjectModules(taken: CachedModules): void {
  evictProjectModules();
  for (const [file, cached] of taken) {
    require.cache[file] = cached;
  }
}

export function cachedModuleCount(): number {
  return Object.keys(require.cache).length;
}

// A module that stays loaded lists every module it ever required, and points
// at the module that first required it. Either link would keep an evicted
// module, and through it the graph of its file, alive.
function releaseEvicted(evicted: Set<CachedModule>): void {
  if (evicted.size === 0) {
    return;
  }
  for (const survivor of [require.main, ...Object.values(require.cache)]) {
    if (!survivor) {
      continue;
    }
    if (survivor.parent && evicted.has(survivor.parent)) {
      survivor.parent = undefined;
    }
    if (survivor.children.some((child) => evicted.has(child))) {
      survivor.children = survivor.children.filter(
        (child) => !evicted.has(child),
      );
    }
  }
}

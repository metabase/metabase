import type { HookRegistry } from "./types";

type AnyFn = (...args: any[]) => any;

type ExtendEntry = { plugin: string; impl: AnyFn; priority: number };
type OverrideEntry = { plugin: string; impl: AnyFn };

type HookEntry = {
  defaultImpl: AnyFn | null;
  override: OverrideEntry | null;
  extends: ExtendEntry[];
};

const registry = new Map<string, HookEntry>();
const activatedPlugins = new Set<string>();

/**
 * Clear all registered overrides/extends and forget which plugins have been
 * activated. Intended for tests and HMR — never call from production code.
 */
export function resetPluginRegistry(): void {
  registry.clear();
  activatedPlugins.clear();
}

function getOrCreate(name: string): HookEntry {
  let entry = registry.get(name);
  if (!entry) {
    entry = { defaultImpl: null, override: null, extends: [] };
    registry.set(name, entry);
  }
  return entry;
}

type ParamsOf<K extends keyof HookRegistry> = HookRegistry[K] extends (
  params: infer P,
) => any
  ? P
  : never;

type ReturnOf<K extends keyof HookRegistry> = HookRegistry[K] extends (
  ...a: any[]
) => infer R
  ? R
  : never;

export function hook<K extends keyof HookRegistry>(
  name: K,
  defaultImpl: HookRegistry[K],
  params: ParamsOf<K>,
): ReturnOf<K> {
  const entry = getOrCreate(name as string);
  entry.defaultImpl = defaultImpl as AnyFn;

  const base: AnyFn = entry.override ? entry.override.impl : entry.defaultImpl;

  if (entry.extends.length === 0) {
    return base(params);
  }

  const sorted = [...entry.extends].sort((a, b) => a.priority - b.priority);
  let chain: AnyFn = base;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const ext = sorted[i];
    const inner = chain;
    chain = (p: unknown) => ext.impl(inner, p);
  }
  return chain(params);
}

type ExtendImpl<K extends keyof HookRegistry> = (
  next: HookRegistry[K],
  params: ParamsOf<K>,
) => ReturnOf<K>;

export type CreatePluginApi = {
  override<K extends keyof HookRegistry>(name: K, impl: HookRegistry[K]): void;
  extend<K extends keyof HookRegistry>(
    name: K,
    impl: ExtendImpl<K>,
    opts?: { priority?: number },
  ): void;
};

export type Plugin = {
  name: string;
  activate(): void;
};

export function createPlugin(
  name: string,
  setup: (api: CreatePluginApi) => void,
): Plugin {
  return {
    name,
    activate() {
      if (activatedPlugins.has(name)) {
        return;
      }
      activatedPlugins.add(name);
      setup({
        override: (hookName, impl) => {
          const entry = getOrCreate(hookName as string);
          if (entry.override) {
            console.warn(
              `[plugins-v2] hook '${String(hookName)}' was overridden by '${entry.override.plugin}'; '${name}' overrides again (last-write-wins)`,
            );
          }
          entry.override = { plugin: name, impl: impl as AnyFn };
        },
        extend: (hookName, impl, opts) => {
          const entry = getOrCreate(hookName as string);
          entry.extends.push({
            plugin: name,
            impl: impl as AnyFn,
            priority: opts?.priority ?? 10,
          });
        },
      });
    },
  };
}

import { Immer } from "immer";

export type { Draft } from "immer";

// We keep results mutable: immer's default auto-freeze would also freeze untouched subtrees shared with other state.
const immer = new Immer({ autoFreeze: false });

/**
 * immer's `produce`, except that the result is not frozen.
 */
export const produce = immer.produce;

/**
 * Reads a nested value, like icepick's `getIn`.
 *
 * Returns `undefined` as soon as a step is falsy (`null`, `undefined`, `0`, `""`, `false`),
 * and `value` itself for an empty path.
 */
export function getByPath(
  value: unknown,
  path: readonly (string | number)[],
): unknown {
  let current = value;
  for (const key of path) {
    if (!current) {
      return undefined;
    }
    current = readProperty(current, key);
  }
  return current;
}

// We box primitives with `Object()` so a truthy string or number reads like `value[key]` does.
function readProperty(container: unknown, key: PropertyKey): unknown {
  return Reflect.get(Object(container), key);
}

import { isObject } from "metabase-types/guards/common";

export type PathKey = string | number;

/**
 * Safely reads a nested value. Returns `undefined` as soon as a step along
 * `path` is missing or is not an object, so it never throws.
 */
export function getAtPath(root: unknown, path: readonly PathKey[]): unknown {
  let node = root;
  for (const key of path) {
    if (!isObject(node)) {
      return undefined;
    }
    node = node[key];
  }
  return node;
}

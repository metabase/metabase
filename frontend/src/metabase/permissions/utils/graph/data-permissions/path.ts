import type { PathKey } from "metabase/utils/get-at-path";
import { isObject } from "metabase-types/guards/common";

function setAtPathUnknown(
  node: unknown,
  path: readonly PathKey[],
  value: unknown,
): unknown {
  if (path.length === 0) {
    return value;
  }
  const [key, ...rest] = path;
  const copy: Record<PathKey, unknown> = isObject(node) ? { ...node } : {};
  copy[key] = setAtPathUnknown(
    isObject(node) ? node[key] : undefined,
    rest,
    value,
  );
  return copy;
}

/**
 * Immutably sets a nested value, copying every object along the path and
 * creating missing intermediate objects. Meant for nested records like the
 * permissions graph: arrays along the path are copied as plain objects.
 */
export function setAtPath<T extends object>(
  root: T,
  path: readonly PathKey[],
  value: unknown,
): T {
  // Only the value at `path` changes, so callers keep the shape of `root`;
  // the path is dynamic so TypeScript cannot verify that.
  return setAtPathUnknown(root, path, value) as T;
}

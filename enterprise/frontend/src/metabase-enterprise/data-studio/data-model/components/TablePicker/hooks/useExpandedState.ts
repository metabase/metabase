import { useCallback, useEffect, useState } from "react";

import type { TreePath } from "../types";
import { expandPath, toKey } from "../utils";

/**
 * Returns a state object that indicates which nodes are expanded in the tree.
 * State directly stores expanded status: true = expanded, false = collapsed.
 * Keys not in state fall back to defaultExpanded.
 */
export function useExpandedState(
  path: TreePath,
  options: { defaultExpanded?: boolean } = {},
) {
  const defaultExpanded = options.defaultExpanded ?? false;
  const [state, setState] = useState<Record<string, boolean>>(() =>
    expandPath({}, path),
  );

  const { databaseId, schemaName, tableId } = path;

  useEffect(() => {
    setState((state) => expandPath(state, { databaseId, schemaName, tableId }));
  }, [databaseId, schemaName, tableId]);

  const isExpanded = useCallback(
    (path: string | TreePath) => {
      const key = typeof path === "string" ? path : toKey(path);
      return state[key] ?? defaultExpanded;
    },
    [state, defaultExpanded],
  );

  const toggle = useCallback(
    (key: string, value?: boolean) => {
      setState((current) => ({
        ...current,
        [key]: value ?? !(current[key] ?? defaultExpanded),
      }));
    },
    [defaultExpanded],
  );

  return {
    isExpanded,
    toggle,
  };
}

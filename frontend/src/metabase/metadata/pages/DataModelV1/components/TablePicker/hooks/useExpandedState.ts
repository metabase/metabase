import { useCallback, useEffect, useState } from "react";

import type { TreePath } from "../types";
import { expandPath, toKey } from "../utils";

/**
 * Returns a state object that indicates which nodes are expanded in the tree.
 */
export function useExpandedState(path: TreePath) {
  const [state, setState] = useState(expandPath({}, path));

  const { databaseId, schemaName, tableId } = path;

  useEffect(() => {
    // When the path changes, this means a user has navigated through the browser back
    // button, ensure the path is completely expanded.
    setState((state) => expandPath(state, { databaseId, schemaName, tableId }));
  }, [databaseId, schemaName, tableId]);

  const isExpanded = useCallback(
    (path: string | TreePath) => {
      const key = typeof path === "string" ? path : toKey(path);
      return Boolean(state[key]);
    },
    [state],
  );

  const toggle = useCallback((key: string, value?: boolean) => {
    setState((current) => ({
      ...current,
      [key]: value ?? !current[key],
    }));
  }, []);

  return {
    isExpanded,
    toggle,
  };
}

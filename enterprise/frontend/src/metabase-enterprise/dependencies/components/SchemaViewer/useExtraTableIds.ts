import { useCallback, useEffect, useRef, useState } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

interface UseExtraTableIdsArgs {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  initialTableIds: ConcreteTableId[] | undefined;
}

interface UseExtraTableIdsResult {
  /**
   * External/extra focal table IDs — specifically tables from OTHER schemas
   * that the user has expanded into via FK click. When a `schema` is set the
   * backend returns all tables in that schema automatically, so we never put
   * schema-native tables in this set.
   */
  extraTableIds: readonly ConcreteTableId[];
  /** Add a table ID to the extra set (no-op if already present). */
  addExtraTableId: (tableId: ConcreteTableId) => void;
  /**
   * Stable key identifying the current (databaseId, schema) tuple. Useful
   * for downstream consumers that need to reset state when the context
   * changes (e.g. clearing the canvas).
   */
  contextKey: string | null;
}

/**
 * Owns the persisted-per-context "extra focal tables" set. Persisted via
 * UserKeyValue under the `schema_viewer` namespace, keyed by
 * `${databaseId}:${schema}`, so external expansions survive reloads.
 *
 * Initialization rules per context:
 *  1. If the URL provided initialTableIds (non-empty), seed from URL and
 *     consider this context initialized — saved prefs are ignored.
 *  2. Otherwise wait for saved prefs to arrive and seed from them.
 *
 * On context change we clear the set immediately and re-seed once via
 * either rule above. The init guard ref prevents re-seeding when the user
 * later clears the set in the same context (which would otherwise
 * loop: user-clear → effect re-applies saved prefs → user-clear → ...).
 */
export function useExtraTableIds({
  databaseId,
  schema,
  initialTableIds,
}: UseExtraTableIdsArgs): UseExtraTableIdsResult {
  const prefsKey = databaseId != null ? `${databaseId}:${schema ?? ""}` : null;
  const contextKey = prefsKey;

  const { value: savedPrefs, setValue: setSavedPrefs } = useUserKeyValue({
    namespace: "schema_viewer",
    key: prefsKey ?? "",
    skip: prefsKey == null,
  });

  // Ref-backed store keyed by `${databaseId}:${schema}` so we don't re-apply
  // URL ids / saved prefs when the user later clears the set in the same
  // context (avoids clearing-then-restoring loops).
  const initializedContextRef = useRef<string | null>(null);

  const [extraTableIds, setExtraTableIds] = useState<
    readonly ConcreteTableId[]
  >(initialTableIds ?? []);

  // When context (database / schema) changes: seed from URL if present, else
  // clear and wait for saved prefs to arrive (next effect).
  const prevContextKeyRef = useRef(contextKey);
  if (prevContextKeyRef.current !== contextKey) {
    prevContextKeyRef.current = contextKey;
    initializedContextRef.current = null;
    setExtraTableIds(initialTableIds ?? []);
  }

  // Restore saved prefs once per context (skipped when URL supplied ids).
  useEffect(() => {
    if (databaseId == null) {
      return;
    }
    if (initializedContextRef.current === contextKey) {
      return;
    }
    if (initialTableIds != null && initialTableIds.length > 0) {
      initializedContextRef.current = contextKey;
      return;
    }
    if (
      savedPrefs != null &&
      typeof savedPrefs === "object" &&
      "table_ids" in savedPrefs &&
      Array.isArray(savedPrefs.table_ids)
    ) {
      initializedContextRef.current = contextKey;
      setExtraTableIds(savedPrefs.table_ids as ConcreteTableId[]);
    }
  }, [databaseId, contextKey, initialTableIds, savedPrefs]);

  const addExtraTableId = useCallback(
    (tableId: ConcreteTableId) => {
      setExtraTableIds((prev) => {
        if (prev.includes(tableId)) {
          return prev;
        }
        const next = [...prev, tableId];
        setSavedPrefs({ table_ids: next });
        return next;
      });
    },
    [setSavedPrefs],
  );

  return { extraTableIds, addExtraTableId, contextKey };
}

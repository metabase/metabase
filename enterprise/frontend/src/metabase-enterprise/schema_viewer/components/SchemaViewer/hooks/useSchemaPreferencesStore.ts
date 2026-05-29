import { useCallback, useState } from "react";
import { usePrevious } from "react-use";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import type {
  ConcreteTableId,
  DatabaseId,
  SchemaName,
} from "metabase-types/api";

type UseSchemaPreferencesStoreArgs = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  initialTableIds: ConcreteTableId[] | undefined;
};

type UseSchemaPreferencesStoreResult = {
  /**
   * External table IDs for the current context — specifically
   * tables from OTHER schemas that the user expanded into via FK click.
   * When a `schema` is set the backend returns all tables in that schema
   * automatically, so we never put schema-native tables in this set.
   */
  extraTableIds: readonly ConcreteTableId[];
  addExtraTableId: (tableId: ConcreteTableId) => void;
  contextKey: `${DatabaseId}__${SchemaName}` | null;
  isRestoring: boolean;
};

const EMPTY_IDS: readonly ConcreteTableId[] = [];

/**
 * Owns per-context `schema_viewer` UserKeyValue restoration:
 *
 *  - `${databaseId}__${schema}` key: persisted set of "extra"
 *    table IDs. Restored on first visit to a context; written on each FK
 *    expansion.
 *
 * Initialization rules per context for the extra-tables set:
 *  1. If the URL provided initialTableIds (non-empty), seed from URL and
 *     consider this context initialized — saved prefs are ignored.
 *  2. Otherwise wait for saved prefs to arrive and seed from them.
 */
export function useSchemaPreferencesStore({
  databaseId,
  schema,
  initialTableIds,
}: UseSchemaPreferencesStoreArgs): UseSchemaPreferencesStoreResult {
  const contextKey: `${DatabaseId}__${SchemaName}` | null =
    databaseId != null ? `${databaseId}__${schema ?? ""}` : null;

  const {
    // Use `currentValue` (RTK Query's `currentData`) rather than `value` so
    // synchronous restoration on context switch is not poisoned by the
    // previous context's value. `value` is sticky across arg changes;
    // `currentValue` is `undefined` until the new subscription resolves.
    currentValue: savedPrefs,
    setValue: setSavedPrefs,
    isLoading: isLoadingSavedPrefs,
  } = useUserKeyValue({
    namespace: "schema_viewer",
    key: contextKey ?? "",
    skip: contextKey == null,
  });

  const [tableIdsByContext, setTableIdsByContext] = useState<
    ReadonlyMap<string, readonly ConcreteTableId[]>
  >(() => {
    const map = new Map<string, readonly ConcreteTableId[]>();
    if (
      contextKey != null &&
      initialTableIds != null &&
      initialTableIds.length > 0
    ) {
      map.set(contextKey, initialTableIds);
    }
    return map;
  });

  const prevContextKey = usePrevious(contextKey);
  if (prevContextKey !== contextKey) {
    if (
      contextKey != null &&
      initialTableIds != null &&
      initialTableIds.length > 0 &&
      !tableIdsByContext.has(contextKey)
    ) {
      setTableIdsByContext((prev) => {
        const next = new Map(prev);
        next.set(contextKey, initialTableIds);
        return next;
      });
    }
  }

  const isRestoring = contextKey != null && !tableIdsByContext.has(contextKey);

  if (
    isRestoring &&
    contextKey != null &&
    !isLoadingSavedPrefs &&
    savedPrefs !== undefined
  ) {
    const restoredIds = savedPrefs != null ? savedPrefs.table_ids : EMPTY_IDS;
    setTableIdsByContext((prev) => {
      if (prev.has(contextKey)) {
        return prev;
      }
      const next = new Map(prev);
      next.set(contextKey, restoredIds);
      return next;
    });
  }

  const extraTableIds =
    contextKey != null
      ? (tableIdsByContext.get(contextKey) ?? EMPTY_IDS)
      : EMPTY_IDS;

  const addExtraTableId = useCallback(
    (tableId: ConcreteTableId) => {
      if (contextKey == null) {
        return;
      }
      setTableIdsByContext((prev) => {
        const current = prev.get(contextKey) ?? EMPTY_IDS;
        if (current.includes(tableId)) {
          return prev;
        }
        const next = [...current, tableId];
        setSavedPrefs({ table_ids: next });
        const newMap = new Map(prev);
        newMap.set(contextKey, next);
        return newMap;
      });
    },
    [contextKey, setSavedPrefs],
  );

  return { extraTableIds, addExtraTableId, contextKey, isRestoring };
}

import { useCallback, useRef, useState } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

type UseSchemaPreferencesStoreArgs = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  initialTableIds: ConcreteTableId[] | undefined;
};

type UseSchemaPreferencesStoreResult = {
  /**
   * External/extra focal table IDs for the current context — specifically
   * tables from OTHER schemas that the user has expanded into via FK click.
   * When a `schema` is set the backend returns all tables in that schema
   * automatically, so we never put schema-native tables in this set.
   */
  extraTableIds: readonly ConcreteTableId[];
  /** Add a table ID to the current context's extra set (no-op if present). */
  addExtraTableId: (tableId: ConcreteTableId) => void;
  /**
   * Stable key identifying the current (databaseId, schema) tuple. Used by
   * downstream consumers that need to reset state when the context changes
   * (e.g. clearing the canvas).
   */
  contextKey: string | null;
  /**
   * True while we're still resolving the per-context saved prefs for the
   * current `contextKey`. Callers should defer issuing the ERD query until
   * this flips false — otherwise they'll fire two requests per context
   * (one with the placeholder empty `extraTableIds`, one with the
   * restored set).
   */
  isRestoring: boolean;
};

const EMPTY_IDS: readonly ConcreteTableId[] = [];

/**
 * Owns per-context `schema_viewer` UserKeyValue restoration:
 *
 *  - `${databaseId}__${schema}` (per-context key): persisted set of "extra"
 *    focal table IDs — typically cross-schema tables the user expanded into
 *    via FK click. Restored on first visit to a context; written on each FK
 *    expansion.
 *
 * Initialization rules per context for the extra-tables set:
 *  1. If the URL provided initialTableIds (non-empty), seed from URL and
 *     consider this context initialized — saved prefs are ignored.
 *  2. Otherwise wait for saved prefs to arrive and seed from them.
 *
 * Per-context entries are cached in a map for the lifetime of the hook, so
 * revisiting a context within the same session skips the restore round-trip
 * and reuses the in-memory value (which addExtraTableId keeps in sync with
 * UKV).
 */
export function useSchemaPreferencesStore({
  databaseId,
  schema,
  initialTableIds,
}: UseSchemaPreferencesStoreArgs): UseSchemaPreferencesStoreResult {
  const contextKey =
    databaseId != null ? `${databaseId}__${schema ?? ""}` : null;

  const {
    // Use `currentValue` (RTK Query's `currentData`) rather than `value` so
    // synchronous restoration on context switch is not poisoned by the
    // previous context's value. `value` is sticky across arg changes; the
    // current* variant is `undefined` until the new subscription resolves.
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

  // On context switch, seed from URL initial ids if present and not yet
  // cached. If no URL ids and no cached entry, the savedPrefs effect below
  // will populate.
  const prevContextKeyRef = useRef(contextKey);
  if (prevContextKeyRef.current !== contextKey) {
    prevContextKeyRef.current = contextKey;
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

  // Once savedPrefs have loaded for an unrestored context, commit them
  // synchronously. The setState-during-render here is the "adjusting state
  // when an input changes" pattern — React will re-run with the updated
  // map before flushing to the DOM.
  if (
    isRestoring &&
    contextKey != null &&
    !isLoadingSavedPrefs &&
    savedPrefs !== undefined
  ) {
    const restoredIds =
      savedPrefs != null &&
      typeof savedPrefs === "object" &&
      "table_ids" in savedPrefs &&
      Array.isArray(savedPrefs.table_ids)
        ? (savedPrefs.table_ids as ConcreteTableId[])
        : EMPTY_IDS;
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";

import { useListDatabasesQuery } from "metabase/api";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/utils/urls";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

type UseRestoreSchemaViewerStateArgs = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  initialTableIds: ConcreteTableId[] | undefined;
};

type UseRestoreSchemaViewerStateResult = {
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

/**
 * Owns all `schema_viewer` UserKeyValue restoration for the page:
 *
 *  - `last_database` (key): on landing without a URL `database-id`, redirect
 *    to the last opened (database, schema). Re-saved on every URL context
 *    change while a database is selected, so the next landing picks up
 *    where the user left off.
 *
 *  - `${databaseId}:${schema}` (per-context key): persisted set of "extra"
 *    focal table IDs — typically cross-schema tables the user expanded into
 *    via FK click. Restored on context entry; written on each FK expansion.
 *
 * Initialization rules per context for the extra-tables set:
 *  1. If the URL provided initialTableIds (non-empty), seed from URL and
 *     consider this context initialized — saved prefs are ignored.
 *  2. Otherwise wait for saved prefs to arrive and seed from them.
 *
 * On context change we clear the set immediately and re-seed once via
 * either rule above. The init guard ref prevents re-seeding when the user
 * later clears the set in the same context (which would otherwise loop:
 * user-clear → effect re-applies saved prefs → user-clear → ...).
 */
export function useRestoreSchemaViewerState({
  databaseId,
  schema,
  initialTableIds,
}: UseRestoreSchemaViewerStateArgs): UseRestoreSchemaViewerStateResult {
  const dispatch = useDispatch();

  // ---- last_database: redirect on landing + persist on context change ----

  const {
    value: lastDatabaseRaw,
    setValue: setLastDatabase,
    isLoading: isLoadingLastDatabase,
  } = useUserKeyValue({
    namespace: "schema_viewer",
    key: "last_database",
  });
  // The `schema_viewer` namespace in UserKeyValue unions two value shapes
  // (per-context table-ids and the last-opened DB record under "last_database")
  // — narrow to the shape this branch cares about.
  const lastDatabase =
    lastDatabaseRaw != null &&
    typeof lastDatabaseRaw === "object" &&
    "databaseId" in lastDatabaseRaw
      ? (lastDatabaseRaw as { databaseId: DatabaseId; schema?: string })
      : undefined;

  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();
  const databases = useMemo(
    () => databasesResponse?.data?.filter((db) => !db.is_saved_questions),
    [databasesResponse],
  );

  // Redirect to last opened database only on initial load (not when user
  // clears selection).
  const hasDbSelected = databaseId != null;
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (hasRedirectedRef.current) {
      return;
    }
    if (
      !isLoadingLastDatabase &&
      !isLoadingDatabases &&
      !hasDbSelected &&
      lastDatabase != null &&
      databases != null
    ) {
      // Validate saved database still exists before redirecting.
      const dbExists = databases.some(
        (db) => db.id === lastDatabase.databaseId,
      );
      if (dbExists) {
        hasRedirectedRef.current = true;
        const url = Urls.dataStudioErd({
          databaseId: lastDatabase.databaseId,
          schema: lastDatabase.schema,
        });
        dispatch(push(url));
      }
    }
    // Mark as "redirected" even if we didn't redirect (no saved db or db
    // doesn't exist) so we don't re-redirect when the user clears selection.
    if (!isLoadingLastDatabase && !isLoadingDatabases) {
      hasRedirectedRef.current = true;
    }
  }, [
    isLoadingLastDatabase,
    isLoadingDatabases,
    hasDbSelected,
    lastDatabase,
    databases,
    dispatch,
  ]);

  // Save current database/schema as last opened.
  useEffect(() => {
    if (databaseId != null) {
      setLastDatabase({ databaseId, schema });
    }
  }, [databaseId, schema, setLastDatabase]);

  // ---- per-context extra focal tables: restore + persist ----

  const contextKey =
    databaseId != null ? `${databaseId}__${schema ?? ""}` : null;

  const {
    value: savedPrefs,
    setValue: setSavedPrefs,
    isLoading: isLoadingSavedPrefs,
  } = useUserKeyValue({
    namespace: "schema_viewer",
    key: contextKey ?? "",
    skip: contextKey == null,
  });

  // Ref-backed store keyed by `${databaseId}__${schema}` so we don't re-apply
  // URL ids / saved prefs when the user later clears the set in the same
  // context (avoids clearing-then-restoring loops). Set to `contextKey` once
  // we've decided what `extraTableIds` should be (URL-seeded, prefs-restored,
  // or confirmed-empty).
  const initializedContextRef = useRef<string | null>(null);

  const [extraTableIds, setExtraTableIds] = useState<
    readonly ConcreteTableId[]
  >(initialTableIds ?? []);

  // When context (database / schema) changes: seed from URL if present, mark
  // initialized when URL provided ids (so we don't wait for saved prefs).
  // Otherwise clear and wait for saved prefs (next in-render block).
  const prevContextKeyRef = useRef(contextKey);
  if (prevContextKeyRef.current !== contextKey) {
    prevContextKeyRef.current = contextKey;
    initializedContextRef.current = null;
    setExtraTableIds(initialTableIds ?? []);
    if (initialTableIds != null && initialTableIds.length > 0) {
      initializedContextRef.current = contextKey;
    }
  }

  // Restore saved prefs once they resolve. Done in-render (not in an effect)
  // so the gate `isRestoring` flips false on the same paint as the state
  // commits — letting consumers fire the ERD query exactly once with the
  // restored `extraTableIds`, instead of once with `[]` and again with the
  // restored set.
  if (
    contextKey != null &&
    initializedContextRef.current !== contextKey &&
    !isLoadingSavedPrefs
  ) {
    initializedContextRef.current = contextKey;
    if (
      savedPrefs != null &&
      typeof savedPrefs === "object" &&
      "table_ids" in savedPrefs &&
      Array.isArray(savedPrefs.table_ids)
    ) {
      setExtraTableIds(savedPrefs.table_ids as ConcreteTableId[]);
    }
  }

  const isRestoring =
    contextKey != null && initializedContextRef.current !== contextKey;

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

  return { extraTableIds, addExtraTableId, contextKey, isRestoring };
}

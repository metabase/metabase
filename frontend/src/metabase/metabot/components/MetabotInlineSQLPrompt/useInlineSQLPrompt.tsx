import type { EditorView } from "@codemirror/view";
import { EditorView as EV, keymap } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  useExtractTablesMutation,
  useLazyGetTableColumnsWithContextQuery,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import { PLUGIN_METABOT } from "metabase/plugins";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  ConcreteTableId,
  DatabaseId,
  DatasetQuery,
  TableReference,
} from "metabase-types/api";

import { MetabotInlineSQLPrompt } from "./MetabotInlineSQLPrompt";
import {
  type PortalTarget,
  createPromptInputExtension,
  hideEffect,
  toggleEffect,
} from "./MetabotInlineSQLPromptWidget";
import { extractMetabotBufferContext } from "./utils";

function useRegisterCodeEditorMetabotContext(
  buffer: EditorView | undefined,
  databaseId: DatabaseId | null,
  bufferId: string,
): void {
  useRegisterMetabotContextProvider(
    async () =>
      buffer
        ? {
            user_is_viewing: [
              {
                type: "code_editor",
                buffers: [
                  extractMetabotBufferContext(buffer, databaseId, bufferId),
                ],
              },
            ],
          }
        : {},
    [buffer],
  );
}

export interface UseInlineSqlEditResult {
  portalElement: React.ReactPortal | null;
  extensions: Extension[];
  proposedQuestion: Question | undefined;
  handleAcceptProposed?: (datasetQuery: DatasetQuery) => void;
  handleRejectProposed?: () => void;
}

export function useInlineSQLPrompt(
  question: Question,
  bufferId: string,
): UseInlineSqlEditResult {
  const llmSqlGenerationEnabled = useSetting("llm-sql-generation-enabled");
  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);

  // TODO: this should get moved into the EE implementation
  // PLUGIN_METABOT.useMetabotSQLSuggestion should take the portalTarget?.view thing
  // we can make the extractMetabotBufferContext part OSS
  useRegisterCodeEditorMetabotContext(
    portalTarget?.view,
    question.databaseId(),
    bufferId,
  );

  const databaseId = question.databaseId();

  const {
    source: generatedSource,
    isLoading,
    error,
    generate,
    cancelRequest,
    clear: clearSuggestion,
    reset: resetSuggestionState,
    reject,
    suggestionModels,
  } = PLUGIN_METABOT.useMetabotSQLSuggestion(databaseId, bufferId);

  // Pinned tables state for entity reference list
  // State persists across prompt open/close cycles
  const [pinnedTables, setPinnedTables] = useState<TableReference[]>([]);
  const [extractTables] = useExtractTablesMutation();
  const lastExtractedSqlRef = useRef<string | null>(null);
  const isExtractingRef = useRef(false);

  // Column filter state: table_id -> Set of enabled column IDs
  // null/undefined entry = all columns enabled (default)
  type ColumnFilterState = Record<number, Set<number> | null>;
  const [columnFilters, setColumnFilters] = useState<ColumnFilterState>({});

  // Column context state: column_id -> user-edited context string
  // Only stores edits - columns not in this map use the auto-generated context
  type ColumnContextState = Record<number, string>;
  const [columnContexts, setColumnContexts] = useState<ColumnContextState>({});

  // Table context state: table_id -> user-edited description string
  // Only stores edits - tables not in this map use the original description
  type TableContextState = Record<number, string>;
  const [tableContexts, setTableContexts] = useState<TableContextState>({});

  // Lazy query for fetching table columns with context (for @mentions)
  const [fetchTableColumnsWithContext] =
    useLazyGetTableColumnsWithContextQuery();

  // Update a single column's context
  const updateColumnContext = useCallback(
    (columnId: number, context: string) => {
      setColumnContexts((prev) => ({
        ...prev,
        [columnId]: context,
      }));
    },
    [],
  );

  // Reset a column's context to auto-generated (remove from state)
  const resetColumnContext = useCallback((columnId: number) => {
    setColumnContexts((prev) => {
      const { [columnId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // Update a table's description context
  const updateTableContext = useCallback((tableId: number, context: string) => {
    setTableContexts((prev) => ({
      ...prev,
      [tableId]: context,
    }));
  }, []);

  // Reset a table's context to original (remove from state)
  const resetTableContext = useCallback((tableId: number) => {
    setTableContexts((prev) => {
      const { [tableId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // Add table with eager column fetching for @mentions
  const addTable = useCallback(
    async (table: TableReference) => {
      // Check if already pinned
      setPinnedTables((prev) => {
        if (prev.some((t) => t.id === table.id)) {
          return prev;
        }
        // Add table immediately (may not have columns yet)
        return [...prev, table];
      });

      // If table doesn't have columns with context, fetch them eagerly
      if (!table.columns?.some((c) => c.context !== undefined) && databaseId) {
        try {
          const result = await fetchTableColumnsWithContext({
            table_id: table.id,
            database_id: databaseId,
          }).unwrap();

          // Update the table with enriched column data
          if (result.columns) {
            setPinnedTables((prev) =>
              prev.map((t) =>
                t.id === table.id ? { ...t, columns: result.columns } : t,
              ),
            );
          }
        } catch {
          // Silently ignore - table is still usable without enhanced context
        }
      }
    },
    [databaseId, fetchTableColumnsWithContext],
  );

  const removeTable = useCallback(
    (tableId: ConcreteTableId) => {
      // Get column IDs before removing the table
      const table = pinnedTables.find((t) => t.id === tableId);
      const columnIds = table?.columns?.map((c) => c.id) ?? [];

      setPinnedTables((prev) => prev.filter((t) => t.id !== tableId));
      // Clean up column filters for removed table
      setColumnFilters((prev) => {
        const { [tableId]: _, ...rest } = prev;
        return rest;
      });
      // Clean up column contexts for removed table's columns
      if (columnIds.length > 0) {
        setColumnContexts((prev) => {
          const newState = { ...prev };
          for (const id of columnIds) {
            delete newState[id];
          }
          return newState;
        });
      }
      // Clean up table context for removed table
      setTableContexts((prev) => {
        const { [tableId]: _, ...rest } = prev;
        return rest;
      });
    },
    [pinnedTables],
  );

  // Toggle single column on/off
  const toggleColumn = useCallback(
    (tableId: number, columnId: number) => {
      setColumnFilters((prev) => {
        const table = pinnedTables.find((t) => t.id === tableId);
        const allColumnIds = table?.columns?.map((c) => c.id) ?? [];

        const current = prev[tableId];
        let newSet: Set<number>;

        if (current === null || current === undefined) {
          // Currently all enabled -> disable this one
          newSet = new Set(allColumnIds.filter((id) => id !== columnId));
        } else if (current.has(columnId)) {
          // Currently enabled -> disable
          newSet = new Set(current);
          newSet.delete(columnId);
        } else {
          // Currently disabled -> enable
          newSet = new Set(current);
          newSet.add(columnId);
        }

        // If all columns now enabled, reset to null
        if (newSet.size === allColumnIds.length) {
          return { ...prev, [tableId]: null };
        }
        return { ...prev, [tableId]: newSet };
      });
    },
    [pinnedTables],
  );

  // Enable/disable all columns for a table
  const setAllColumns = useCallback((tableId: number, enabled: boolean) => {
    setColumnFilters((prev) => ({
      ...prev,
      [tableId]: enabled ? null : new Set(),
    }));
  }, []);

  // Get enabled column count for display
  const getEnabledColumnCount = useCallback(
    (tableId: number): { enabled: number; total: number } | null => {
      const table = pinnedTables.find((t) => t.id === tableId);
      if (!table?.columns) {
        return null;
      }

      const total = table.columns.length;
      const filter = columnFilters[tableId];
      const enabled =
        filter === null || filter === undefined ? total : filter.size;

      return { enabled, total };
    },
    [pinnedTables, columnFilters],
  );

  // Build column_filters for API request
  const buildColumnFiltersForRequest = useCallback(():
    | Record<number, number[]>
    | undefined => {
    const filters: Record<number, number[]> = {};
    let hasFilters = false;

    for (const table of pinnedTables) {
      const filter = columnFilters[table.id];
      if (filter !== null && filter !== undefined && filter.size > 0) {
        filters[table.id] = Array.from(filter);
        hasFilters = true;
      } else if (filter !== null && filter !== undefined && filter.size === 0) {
        // All disabled - still include empty array
        filters[table.id] = [];
        hasFilters = true;
      }
      // null/undefined = all columns, don't include in request
    }

    return hasFilters ? filters : undefined;
  }, [pinnedTables, columnFilters]);

  // Build column_contexts for API request (only includes user-edited contexts)
  const buildColumnContextsForRequest = useCallback(():
    | Record<number, Record<number, string>>
    | undefined => {
    if (Object.keys(columnContexts).length === 0) {
      return undefined;
    }

    // Group column contexts by table ID
    const contexts: Record<number, Record<number, string>> = {};
    for (const table of pinnedTables) {
      const tableColContexts: Record<number, string> = {};
      for (const column of table.columns ?? []) {
        if (columnContexts[column.id] !== undefined) {
          tableColContexts[column.id] = columnContexts[column.id];
        }
      }
      if (Object.keys(tableColContexts).length > 0) {
        contexts[table.id] = tableColContexts;
      }
    }

    return Object.keys(contexts).length > 0 ? contexts : undefined;
  }, [pinnedTables, columnContexts]);

  // Build table_contexts for API request (only includes user-edited table descriptions)
  const buildTableContextsForRequest = useCallback(():
    | Record<number, string>
    | undefined => {
    if (Object.keys(tableContexts).length === 0) {
      return undefined;
    }

    // Only include contexts for tables that are still pinned
    const contexts: Record<number, string> = {};
    for (const table of pinnedTables) {
      if (tableContexts[table.id] !== undefined) {
        contexts[table.id] = tableContexts[table.id];
      }
    }

    return Object.keys(contexts).length > 0 ? contexts : undefined;
  }, [pinnedTables, tableContexts]);

  // Get effective context for a column (user-edited or auto-generated)
  const getColumnContext = useCallback(
    (columnId: number): string | null => {
      // If user has edited this column's context, return the edited version
      if (columnContexts[columnId] !== undefined) {
        return columnContexts[columnId];
      }
      // Otherwise return the auto-generated context from the column data
      for (const table of pinnedTables) {
        const column = table.columns?.find((c) => c.id === columnId);
        if (column) {
          return column.context ?? null;
        }
      }
      return null;
    },
    [pinnedTables, columnContexts],
  );

  // Check if a column's context has been edited
  const isColumnContextEdited = useCallback(
    (columnId: number): boolean => {
      return columnContexts[columnId] !== undefined;
    },
    [columnContexts],
  );

  // Get effective description for a table (user-edited or original)
  const getTableContext = useCallback(
    (tableId: number): string | null => {
      // If user has edited this table's description, return the edited version
      if (tableContexts[tableId] !== undefined) {
        return tableContexts[tableId];
      }
      // Otherwise return the original description from the table data
      const table = pinnedTables.find((t) => t.id === tableId);
      return table?.description ?? null;
    },
    [pinnedTables, tableContexts],
  );

  // Check if a table's context has been edited
  const isTableContextEdited = useCallback(
    (tableId: number): boolean => {
      return tableContexts[tableId] !== undefined;
    },
    [tableContexts],
  );

  // Extract tables from SQL and merge with existing pinned tables
  const refreshTablesFromSql = useCallback(
    async (sql: string) => {
      if (!databaseId || !sql.trim() || isExtractingRef.current) {
        return;
      }

      // Skip if SQL hasn't changed since last extraction
      if (sql === lastExtractedSqlRef.current) {
        return;
      }

      isExtractingRef.current = true;
      try {
        const result = await extractTables({
          database_id: databaseId,
          sql,
        }).unwrap();

        lastExtractedSqlRef.current = sql;

        if (result.tables.length > 0) {
          // Merge extracted tables with existing pinned tables (deduplicated)
          setPinnedTables((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            const newTables = result.tables.filter(
              (t) => !existingIds.has(t.id),
            );
            return [...prev, ...newTables];
          });
        }
      } catch {
        // Silently ignore extraction errors
      } finally {
        isExtractingRef.current = false;
      }
    },
    [databaseId, extractTables],
  );

  // Keep ref updated for use in effects
  const refreshTablesFromSqlRef = useRef(refreshTablesFromSql);
  useEffect(() => {
    refreshTablesFromSqlRef.current = refreshTablesFromSql;
  }, [refreshTablesFromSql]);

  // Initialize tables from SQL when editor becomes available
  useEffect(
    function initializeTablesOnMount() {
      if (portalTarget?.view) {
        const sql = portalTarget.view.state.doc.toString();
        if (sql.trim()) {
          refreshTablesFromSqlRef.current(sql);
        }
      }
    },
    [portalTarget?.view],
  );

  const hideInput = useCallback(() => {
    portalTarget?.view.dispatch({ effects: hideEffect.of() });
    portalTarget?.view.focus();
  }, [portalTarget?.view]);

  const getSourceSql = useCallback(() => {
    return portalTarget?.view.state.doc.toString() ?? "";
  }, [portalTarget?.view]);

  const hideInputRef = useRef(hideInput);
  useLayoutEffect(() => {
    hideInputRef.current = hideInput;
  });

  useEffect(
    function autoCloseOnResult() {
      if (generatedSource) {
        hideInput();
      }
    },
    [generatedSource, hideInput],
  );

  const generatedSqlRef = useRef(generatedSource);
  generatedSqlRef.current = generatedSource;

  const clearSuggestionRef = useRef(clearSuggestion);
  useEffect(() => {
    clearSuggestionRef.current = clearSuggestion;
  }, [clearSuggestion]);

  useEffect(
    function resetOnDbChangeAndUnmount() {
      return () => {
        hideInputRef.current();
        resetSuggestionState();
      };
    },
    [resetSuggestionState, databaseId],
  );

  const resetInput = useCallback(() => {
    clearSuggestion();
    // Note: We intentionally do NOT clear pinnedTables here
    // so they persist across prompt open/close cycles
    hideInput();
  }, [clearSuggestion, hideInput]);

  // NOTE: ref is needed for the extension to not be recalculated in the useMemo
  // below, while still being able to reset the suggestion state on close
  const resetInputRef = useRef(resetInput);
  useEffect(() => {
    resetInputRef.current = resetInput;
  }, [resetInput]);

  const proposedQuestion = useMemo(
    () =>
      generatedSource
        ? question.setQuery(
            Lib.withNativeQuery(question.query(), generatedSource),
          )
        : undefined,
    [generatedSource, question],
  );

  const handleRejectProposed = generatedSource
    ? () => {
        resetInput();
        reject();
      }
    : undefined;

  const handleAcceptProposed = generatedSource ? resetInput : undefined;

  const extensions = useMemo(
    () =>
      llmSqlGenerationEnabled
        ? [
            createPromptInputExtension(setPortalTarget),
            keymap.of([
              {
                key: `Mod-Shift-i`,
                run: (view) => {
                  resetInputRef.current();
                  view.dispatch({ effects: toggleEffect.of({ view }) });
                  return true;
                },
              },
            ]),
            EV.updateListener.of((update) => {
              if (!update.docChanged || !generatedSqlRef.current) {
                return;
              }
              // Only clear suggestion if change was from user input, not programmatic
              const isUserEdit = update.transactions.some(
                (tr) =>
                  tr.isUserEvent("input") ||
                  tr.isUserEvent("delete") ||
                  tr.isUserEvent("move"),
              );
              if (isUserEdit) {
                clearSuggestionRef.current();
              }
            }),
          ]
        : [],
    [llmSqlGenerationEnabled],
  );

  return {
    extensions,
    portalElement:
      llmSqlGenerationEnabled && portalTarget
        ? createPortal(
            <MetabotInlineSQLPrompt
              databaseId={databaseId}
              onClose={hideInput}
              isLoading={isLoading}
              error={error}
              generate={generate}
              cancelRequest={cancelRequest}
              suggestionModels={suggestionModels}
              getSourceSql={getSourceSql}
              pinnedTables={pinnedTables}
              onAddTable={addTable}
              onRemoveTable={removeTable}
              onRefreshTables={refreshTablesFromSql}
              columnFilters={columnFilters}
              onToggleColumn={toggleColumn}
              onSetAllColumns={setAllColumns}
              getEnabledColumnCount={getEnabledColumnCount}
              buildColumnFiltersForRequest={buildColumnFiltersForRequest}
              getColumnContext={getColumnContext}
              isColumnContextEdited={isColumnContextEdited}
              onUpdateColumnContext={updateColumnContext}
              onResetColumnContext={resetColumnContext}
              buildColumnContextsForRequest={buildColumnContextsForRequest}
              getTableContext={getTableContext}
              isTableContextEdited={isTableContextEdited}
              onUpdateTableContext={updateTableContext}
              onResetTableContext={resetTableContext}
              buildTableContextsForRequest={buildTableContextsForRequest}
            />,
            portalTarget.container,
          )
        : null,
    proposedQuestion: llmSqlGenerationEnabled ? proposedQuestion : undefined,
    handleRejectProposed: llmSqlGenerationEnabled
      ? handleRejectProposed
      : undefined,
    handleAcceptProposed: llmSqlGenerationEnabled
      ? handleAcceptProposed
      : undefined,
  };
}

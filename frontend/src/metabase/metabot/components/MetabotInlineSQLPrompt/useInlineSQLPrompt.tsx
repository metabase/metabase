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

import { useExtractTablesMutation } from "metabase/api";
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

  const addTable = useCallback((table: TableReference) => {
    setPinnedTables((prev) => {
      if (prev.some((t) => t.id === table.id)) {
        return prev;
      }
      return [...prev, table];
    });
  }, []);

  const removeTable = useCallback((tableId: ConcreteTableId) => {
    setPinnedTables((prev) => prev.filter((t) => t.id !== tableId));
  }, []);

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

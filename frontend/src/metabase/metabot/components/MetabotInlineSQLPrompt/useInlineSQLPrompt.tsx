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

import { skipToken, useExtractTablesQuery } from "metabase/api";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import { PLUGIN_METABOT } from "metabase/plugins";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatabaseId, DatasetQuery } from "metabase-types/api";

import { MetabotInlineSQLPrompt } from "./MetabotInlineSQLPrompt";
import {
  type PortalTarget,
  createPromptInputExtension,
  hideEffect,
  toggleEffect,
} from "./MetabotInlineSQLPromptWidget";
import type { SelectedTable } from "./TablePillsInput";
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
  const isTableBarEnabled = !useHasTokenFeature("metabot_v3");
  const llmSqlGenerationEnabled = useSetting("llm-sql-generation-enabled");

  const databaseId = question.databaseId();

  const [hasEverBeenOpened, setHasEverBeenOpened] = useState(false);

  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>([]);
  const [editorSql, setEditorSql] = useState(() => {
    const query = question.query();
    return Lib.queryDisplayInfo(query).isNative
      ? Lib.rawNativeQuery(query)
      : "";
  });

  const debouncedEditorSql = useDebouncedValue(editorSql.trim(), 1000);
  const tableExtractionEnabled = hasEverBeenOpened && isTableBarEnabled;
  const { data: extractedTablesData } = useExtractTablesQuery(
    databaseId && debouncedEditorSql && tableExtractionEnabled
      ? { database_id: databaseId, sql: debouncedEditorSql }
      : skipToken,
  );

  useRegisterCodeEditorMetabotContext(
    portalTarget?.view,
    question.databaseId(),
    bufferId,
  );

  const sourceSqlTables = useMemo(
    () => extractedTablesData?.tables ?? [],
    [extractedTablesData],
  );

  // Merge new tables from extracted data into selected tables
  useEffect(() => {
    if (!sourceSqlTables.length) {
      return;
    }
    setSelectedTables((prev) => {
      const selectedIds = new Set(prev.map((t) => t.id));
      const newTables = sourceSqlTables.filter((t) => !selectedIds.has(t.id));
      return newTables.length > 0 ? [...prev, ...newTables] : prev;
    });
  }, [sourceSqlTables]);

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
  } = PLUGIN_METABOT.useMetabotSQLSuggestion({
    databaseId,
    bufferId,
    onGenerated: (res) => {
      if (res) {
        setSelectedTables(
          res.referenced_entities as unknown as SelectedTable[],
        );
      }
      setPromptValue("");
    },
  });

  const getSourceSql = useCallback(() => {
    return portalTarget?.view.state.doc.toString() ?? "";
  }, [portalTarget?.view]);

  const prevDatabaseIdRef = useRef(databaseId);
  useEffect(() => {
    if (prevDatabaseIdRef.current !== databaseId) {
      setPromptValue("");
      setSelectedTables([]);
      prevDatabaseIdRef.current = databaseId;
    }
  }, [databaseId]);

  const generatedSqlRef = useRef(generatedSource);
  generatedSqlRef.current = generatedSource;

  const clearSuggestionRef = useRef(clearSuggestion);
  useEffect(() => {
    clearSuggestionRef.current = clearSuggestion;
  }, [clearSuggestion]);

  const hideInput = useCallback(() => {
    portalTarget?.view.dispatch({ effects: hideEffect.of() });
    portalTarget?.view.focus();
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
    hideInput();
  }, [clearSuggestion, hideInput]);

  const handleClose = () => {
    hideInput();
    setSelectedTables(sourceSqlTables);
  };

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
                  if (generatedSqlRef.current) {
                    resetInputRef.current();
                  }
                  setHasEverBeenOpened(true);
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
            // Track SQL changes for prefetching table extraction
            EV.updateListener.of((update) => {
              if (update.docChanged) {
                setEditorSql(update.state.doc.toString());
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
              onClose={handleClose}
              isLoading={isLoading}
              error={error}
              generate={generate}
              cancelRequest={cancelRequest}
              suggestionModels={suggestionModels}
              getSourceSql={getSourceSql}
              value={promptValue}
              onValueChange={setPromptValue}
              isTableBarEnabled={isTableBarEnabled}
              selectedTables={selectedTables}
              onSelectedTablesChange={setSelectedTables}
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

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

import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useMetabotSQLSuggestion } from "metabase/metabot/hooks/use-metabot-sql-suggestion";
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
import { extractMetabotBufferContext } from "./utils";

function useRegisterCodeEditorMetabotContext(
  buffer: EditorView | undefined,
  databaseId: DatabaseId | null,
  bufferId: string,
): void {
  useRegisterMetabotContextProvider(
    async () => ({
      user_is_viewing: [
        {
          type: "code_editor",
          buffers: [extractMetabotBufferContext(buffer, databaseId, bufferId)],
        },
      ],
    }),
    [buffer, databaseId, bufferId],
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
  const { canUseSqlGeneration, hasSqlGenerationAccess } =
    useUserMetabotPermissions();

  const databaseId = question.databaseId();

  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const onGenerated = useCallback(() => setPromptValue(""), []);

  useRegisterCodeEditorMetabotContext(
    portalTarget?.view ?? undefined,
    databaseId,
    bufferId,
  );

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
  } = useMetabotSQLSuggestion({ databaseId, bufferId, onGenerated });

  const getSourceSql = useCallback(() => {
    return portalTarget?.view?.state.doc.toString() ?? "";
  }, [portalTarget?.view]);

  const prevDatabaseIdRef = useRef(databaseId);
  useEffect(() => {
    if (prevDatabaseIdRef.current !== databaseId) {
      setPromptValue("");
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
      hasSqlGenerationAccess
        ? [
            createPromptInputExtension(setPortalTarget),
            keymap.of([
              {
                key: `Mod-Shift-i`,
                run: (view) => {
                  if (generatedSqlRef.current) {
                    resetInputRef.current();
                  }
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
    [hasSqlGenerationAccess],
  );

  return {
    extensions,
    portalElement:
      hasSqlGenerationAccess && portalTarget
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
            />,
            portalTarget.container,
          )
        : null,
    proposedQuestion: canUseSqlGeneration ? proposedQuestion : undefined,
    handleRejectProposed: canUseSqlGeneration
      ? handleRejectProposed
      : undefined,
    handleAcceptProposed: canUseSqlGeneration
      ? handleAcceptProposed
      : undefined,
  };
}

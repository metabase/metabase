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

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import {
  addDeveloperMessage,
  getMetabotSuggestedCodeEdit,
  removeSuggestedCodeEdit,
  resetConversation,
} from "metabase/metabot/state";
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
  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);

  useRegisterCodeEditorMetabotContext(
    portalTarget?.view,
    question.databaseId(),
    bufferId,
  );

  const dispatch = useDispatch();
  const generatedSql = useSelector((state) =>
    getMetabotSuggestedCodeEdit(state, bufferId),
  )?.value;

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
      if (generatedSql) {
        hideInput();
      }
    },
    [generatedSql, hideInput],
  );

  const generatedSqlRef = useRef(generatedSql);
  generatedSqlRef.current = generatedSql;

  const clearSuggestion = useCallback(() => {
    dispatch(removeSuggestedCodeEdit(bufferId));
  }, [dispatch, bufferId]);

  const clearSuggestionRef = useRef(clearSuggestion);
  useEffect(() => {
    clearSuggestionRef.current = clearSuggestion;
  }, [clearSuggestion]);

  const databaseId = question.databaseId();
  useEffect(
    function resetOnDbChangeAndUnmount() {
      return () => {
        hideInputRef.current();
        dispatch(removeSuggestedCodeEdit(bufferId));
        dispatch(resetConversation({ agentId: "sql" }));
      };
    },
    [dispatch, databaseId, bufferId],
  );

  const resetInput = useCallback(() => {
    dispatch(removeSuggestedCodeEdit(bufferId));
    hideInput();
  }, [dispatch, hideInput, bufferId]);

  // NOTE: ref is needed for the extension to not be recalculated in the useMemo
  // below, while still being able to reset the suggestion state on close
  const resetInputRef = useRef(resetInput);
  useEffect(() => {
    resetInputRef.current = resetInput;
  }, [resetInput]);

  const proposedQuestion = useMemo(
    () =>
      generatedSql
        ? question.setQuery(Lib.withNativeQuery(question.query(), generatedSql))
        : undefined,
    [generatedSql, question],
  );

  const handleRejectProposed = generatedSql
    ? () => {
        resetInput();
        dispatch(
          addDeveloperMessage({
            agentId: "sql",
            message: `User rejected the following suggestion:\n\n${generatedSql}`,
          }),
        );
      }
    : undefined;

  const handleAcceptProposed = generatedSql ? resetInput : undefined;

  const extensions = useMemo(
    () => [
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
    ],
    [],
  );

  return {
    extensions,
    portalElement: portalTarget
      ? createPortal(
          <MetabotInlineSQLPrompt
            databaseId={databaseId}
            onClose={hideInput}
          />,
          portalTarget.container,
        )
      : null,
    proposedQuestion,
    handleRejectProposed,
    handleAcceptProposed,
  };
}

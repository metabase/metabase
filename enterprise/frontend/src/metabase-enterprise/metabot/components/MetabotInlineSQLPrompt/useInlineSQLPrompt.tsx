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
import { useMetabotSQLSuggestion } from "metabase-enterprise/metabot/hooks/use-metabot-sql-suggestion";
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

  const {
    source,
    clear: clearSuggestion,
    reset: resetSuggestionState,
    reject,
  } = useMetabotSQLSuggestion(bufferId);

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
      if (source) {
        hideInput();
      }
    },
    [source, hideInput],
  );

  const generatedSqlRef = useRef(source);
  generatedSqlRef.current = source;

  const clearSuggestionRef = useRef(clearSuggestion);
  useEffect(() => {
    clearSuggestionRef.current = clearSuggestion;
  }, [clearSuggestion]);

  const databaseId = question.databaseId();
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

  // NOTE: ref is needed for the extension to not be recalculated in the useMemo
  // below, while still being able to reset the suggestion state on close
  const resetInputRef = useRef(resetInput);
  useEffect(() => {
    resetInputRef.current = resetInput;
  }, [resetInput]);

  const proposedQuestion = useMemo(
    () =>
      source
        ? question.setQuery(Lib.withNativeQuery(question.query(), source))
        : undefined,
    [source, question],
  );

  const handleRejectProposed = source
    ? () => {
        resetInput();
        reject();
      }
    : undefined;

  const handleAcceptProposed = source ? resetInput : undefined;

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
            bufferId={bufferId}
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

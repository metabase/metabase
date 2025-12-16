import type { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
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
import {
  useMetabotDispatch,
  useMetabotSelector,
} from "metabase-enterprise/metabot/hooks/use-metabot-store";
import {
  addDeveloperMessage,
  getMetabotSuggestedCodeEdit,
  removeSuggestedCodeEdit,
  resetConversation,
} from "metabase-enterprise/metabot/state";
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

  const dispatch = useMetabotDispatch();
  const generatedSql = useMetabotSelector((state) =>
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
          key: "Mod-;",
          run: (view) => {
            resetInputRef.current();
            view.dispatch({ effects: toggleEffect.of({ view }) });
            return true;
          },
        },
      ]),
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

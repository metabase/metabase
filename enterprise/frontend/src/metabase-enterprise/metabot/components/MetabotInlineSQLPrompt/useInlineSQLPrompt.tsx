import type { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import {
  addDeveloperMessage,
  deactivateSuggestedCodeEdit,
  getMetabotSuggestedCodeEdit,
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
): void {
  useRegisterMetabotContextProvider(
    async () =>
      buffer
        ? {
            user_is_viewing: [
              {
                type: "code_editor",
                buffers: [extractMetabotBufferContext(buffer, databaseId)],
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

export function useInlineSQLPrompt(question: Question): UseInlineSqlEditResult {
  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);

  useRegisterCodeEditorMetabotContext(
    portalTarget?.view,
    question.databaseId(),
  );

  const dispatch = useDispatch();
  const generatedSql = useSelector((state) =>
    getMetabotSuggestedCodeEdit(state, "default"),
  )?.value;

  // HACK: Closing and reopening the widget when we receive generated SQL
  // to force CodeMirror to recalculate gutter positions. The line numbers
  // and diff UI seem to not respect the height of the prompt input and
  // forcing a remeasure doesn't seem to be sufficient. RAF usage is needed
  // otherwise the effects happen too quickly and the measureing doesn't
  // happen correctly
  useEffect(() => {
    if (generatedSql && portalTarget?.view) {
      requestAnimationFrame(() => {
        portalTarget.view.dispatch({ effects: hideEffect.of() });
        portalTarget.view.dispatch({
          effects: toggleEffect.of({ view: portalTarget.view }),
        });
        // Focus the SQL editor after reopening
        requestAnimationFrame(() => {
          portalTarget.view.focus();
        });
      });
    }
  }, [generatedSql, portalTarget?.view]);

  const hideInput = useCallback(() => {
    portalTarget?.view.dispatch({ effects: hideEffect.of() });
    portalTarget?.view.focus();
  }, [portalTarget?.view]);

  const resetInput = useCallback(() => {
    dispatch(deactivateSuggestedCodeEdit("default"));
    hideInput();
  }, [dispatch, hideInput]);

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
          addDeveloperMessage(
            `User rejected the following suggestion:\n\n${generatedSql}`,
          ),
        );
      }
    : undefined;

  const handleAcceptProposed = generatedSql
    ? () => {
        if (portalTarget?.view) {
          const { view } = portalTarget;
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: generatedSql,
            },
          });
        }
        resetInput();
      }
    : undefined;

  const extensions = useMemo(
    () => [
      createPromptInputExtension(setPortalTarget),
      keymap.of([
        {
          key: "Mod-i",
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
            onClose={hideInput}
            proposedSQL={generatedSql}
            onAcceptProposed={handleAcceptProposed}
            onRejectProposed={handleRejectProposed}
          />,
          portalTarget.container,
        )
      : null,
    proposedQuestion,
  };
}

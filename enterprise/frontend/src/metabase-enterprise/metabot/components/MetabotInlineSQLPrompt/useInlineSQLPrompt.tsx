import type { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

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
): void {
  useRegisterMetabotContextProvider(
    async () =>
      buffer
        ? {
            user_is_viewing: [
              {
                type: "code_editor",
                buffers: [extractMetabotBufferContext(buffer)],
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

  useRegisterCodeEditorMetabotContext(portalTarget?.view);

  /* TODO: temp hack - communicate sql via global notifier used in navigate to handler */
  const [generatedSql, setGeneratedSql] = useState<string | undefined>();
  useEffect(() => {
    (window as any).notifyCodeEdit = (sql: string) => setGeneratedSql(sql);
  }, []);
  /* TODO: temp hack end */

  const hideInput = () => {
    portalTarget?.view.dispatch({ effects: hideEffect.of() });
    portalTarget?.view.focus();
  };

  const resetInput = () => {
    setGeneratedSql(undefined);
    hideInput();
  };

  const proposedQuestion = useMemo(
    () =>
      generatedSql
        ? question.setQuery(Lib.withNativeQuery(question.query(), generatedSql))
        : undefined,
    [generatedSql, question],
  );

  const handleRejectProposed = generatedSql ? resetInput : undefined;
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
          key: "Mod-e",
          run: (view) => {
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
            onAcceptProposed={handleAcceptProposed}
            onRejectProposed={handleRejectProposed}
          />,
          portalTarget.container,
        )
      : null,
    proposedQuestion,
  };
}

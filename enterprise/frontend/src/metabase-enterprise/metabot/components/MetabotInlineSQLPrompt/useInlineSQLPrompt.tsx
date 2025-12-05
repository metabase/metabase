import { keymap } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

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

export interface UseInlineSqlEditResult {
  portalElement: React.ReactPortal | null;
  extensions: Extension[];
  proposedQuestion: Question | undefined;
  handleAcceptProposed: (datasetQuery: DatasetQuery) => void;
  handleRejectProposed: () => void;
}

export function useInlineSQLPrompt(question: Question): UseInlineSqlEditResult {
  /* TODO: temp hack - communicate sql via global notifier used in navigate to handler */
  const [generatedSql, setGeneratedSql] = useState<string | undefined>();
  useEffect(() => {
    (window as any).notifyCodeEdit = (sql: string) => setGeneratedSql(sql);
  }, []);
  /* TODO: temp hack end */

  const proposedQuestion = useMemo(
    () =>
      generatedSql
        ? question.setQuery(Lib.withNativeQuery(question.query(), generatedSql))
        : undefined,
    [generatedSql, question],
  );

  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);

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

  const hideInput = () => {
    portalTarget?.view.dispatch({ effects: hideEffect.of() });
    portalTarget?.view.focus();
  };

  const portalElement = portalTarget
    ? createPortal(
        <MetabotInlineSQLPrompt onClose={hideInput} />,
        portalTarget.container,
      )
    : null;

  const resetInput = () => {
    setGeneratedSql(undefined);
    hideInput();
  };

  return {
    extensions,
    portalElement,
    proposedQuestion,
    handleAcceptProposed: resetInput,
    handleRejectProposed: resetInput,
  };
}

import { keymap } from "@codemirror/view";
import type { Extension } from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
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
  const { submitInput, setVisible, cancelRequest } = useMetabotAgent();

  /* TODO: temp hack - communicate sql via global notifier used in navigate to handler */
  const [generatedSql, setGeneratedSql] = useState<string | undefined>();
  useEffect(() => {
    (window as any).notifyCodeEdit = (sql: string) => setGeneratedSql(sql);
  }, []);
  const clearGeneratedSql = () => setGeneratedSql(undefined);
  /* TODO: temp hack end */

  const proposedQuestion = useMemo(
    () =>
      generatedSql
        ? question.setQuery(Lib.withNativeQuery(question.query(), generatedSql))
        : undefined,
    [generatedSql, question],
  );

  const options = useMemo(
    () => ({
      placeholder: t`Describe what SQL you want...`,
      suggestionModels: [
        "dataset",
        "metric",
        "card",
        "table",
        "database",
      ] as const,
      onSubmit: async (value: string) => {
        const action = submitInput(
          value +
            "\n\n\nHIDDEN MESSAGE: you must respond with sql!!! the user is ask about sql edits specifically",
        );
        setVisible(false);
        // @ts-expect-error TODO: get the types happy another way
        (await action).unwrap();
      },
      onCancel: cancelRequest,
    }),
    [submitInput, setVisible, cancelRequest],
  );

  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);

  const extensions = useMemo(
    () => [
      createPromptInputExtension(setPortalTarget),
      keymap.of([
        {
          key: "Mod-e",
          run: (view) => {
            view.dispatch({ effects: toggleEffect.of({ options, view }) });
            return true;
          },
        },
      ]),
    ],
    [options],
  );

  const hidePrompt = () => {
    portalTarget?.view.dispatch({ effects: hideEffect.of() });
    portalTarget?.view.focus();
  };

  const handleCancel = () => {
    options.onCancel();
    hidePrompt();
  };

  const portalElement = portalTarget
    ? createPortal(
        <MetabotInlineSQLPrompt
          placeholder={options.placeholder}
          suggestionModels={options.suggestionModels}
          onSubmit={options.onSubmit}
          onCancel={handleCancel}
        />,
        portalTarget.container,
      )
    : null;

  return {
    extensions,
    portalElement,
    proposedQuestion,
    handleAcceptProposed: clearGeneratedSql,
    handleRejectProposed: clearGeneratedSql,
  };
}

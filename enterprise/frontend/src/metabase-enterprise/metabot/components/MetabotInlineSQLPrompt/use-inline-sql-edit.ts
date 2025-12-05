import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { useInlinePrompt } from "./inline-prompt";
import { Extension } from "@uiw/react-codemirror";

export interface UseInlineSqlEditOptions {
  question: Question;
}

export interface UseInlineSqlEditResult {
  portalElement: React.ReactPortal | null;
  extensions: Extension[];
  proposedQuestion: Question | undefined;
  handleAcceptProposed: (datasetQuery: DatasetQuery) => void;
  handleRejectProposed: () => void;
}

// TODO: finish refactor / merge this with useInlinePrompt
export function useInlineSqlEdit({
  question,
}: UseInlineSqlEditOptions): UseInlineSqlEditResult {
  const { submitInput, setVisible, cancelRequest } = useMetabotAgent();

  /* TODO: temp hack - communicate sql via global notifier used in navigate to handler */
  const [generatedSql, setGeneratedSql] = useState<string | undefined>();
  useEffect(() => {
    (window as any).notifyCodeEdit = (sql: string) => setGeneratedSql(sql);
    return () => {
      delete (window as any).notifyCodeEdit;
    };
  }, []);
  const clearGeneratedSql = useCallback(() => {
    setGeneratedSql(undefined);
  }, []);
  /* TODO: temp hack end */

  const proposedQuestion = useMemo(
    () =>
      generatedSql
        ? question.setQuery(Lib.withNativeQuery(question.query(), generatedSql))
        : undefined,
    [generatedSql, question],
  );

  const inlinePromptOptions = useMemo(
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

  const { extensions, portalElement } = useInlinePrompt(inlinePromptOptions);

  return {
    extensions,
    portalElement,
    proposedQuestion,
    handleAcceptProposed: clearGeneratedSql,
    handleRejectProposed: clearGeneratedSql,
  };
}

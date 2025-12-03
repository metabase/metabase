import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

// eslint-disable-next-line no-restricted-imports
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import type { InlinePromptOptions } from "./inline-prompt";

export interface UseInlineSqlEditOptions {
  question: Question;
}

export interface UseInlineSqlEditResult {
  inlinePromptOptions: InlinePromptOptions;
  proposedQuestion: Question | undefined;
  handleAcceptProposed: (datasetQuery: DatasetQuery) => void;
  handleRejectProposed: () => void;
}

export function useInlineSqlEdit({
  question,
}: UseInlineSqlEditOptions): UseInlineSqlEditResult {
  const { submitInput, setVisible, cancelRequest } = useMetabotAgent();

  // State for managing AI-generated SQL
  const [generatedSql, setGeneratedSql] = useState<string | undefined>();

  // Bridge the global callback (temporary hack) to our state
  useEffect(() => {
    (window as any).notifyCodeEdit = (sql: string) => setGeneratedSql(sql);
    return () => {
      delete (window as any).notifyCodeEdit;
    };
  }, []);

  const clearGeneratedSql = useCallback(() => {
    setGeneratedSql(undefined);
  }, []);

  // Create a proposed question from the generated SQL
  const proposedQuestion = useMemo(() => {
    if (!generatedSql) {
      return undefined;
    }
    const currentQuery = question.query();
    const newQuery = Lib.withNativeQuery(currentQuery, generatedSql);
    return question.setQuery(newQuery);
  }, [generatedSql, question]);

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

  return {
    inlinePromptOptions,
    proposedQuestion,
    handleAcceptProposed: clearGeneratedSql,
    handleRejectProposed: clearGeneratedSql,
  };
}

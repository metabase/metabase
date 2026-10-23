import { useState } from "react";
import { t } from "ttag";

import { useSuggestPrototypeFilterValuesMutation } from "metabase/api";
import * as Lib from "metabase-lib";

import type { DraftColumn, DraftOperator } from "./types";
import { getPillOperatorLabel, isValidValue } from "./utils";

const AI_PROMPT_PREFIX = "@";

/** True when the text of an input is a request to the AI, like "@EU". */
export function isAiPrompt(text: string) {
  return text.trimStart().startsWith(AI_PROMPT_PREFIX);
}

/** The request to the AI without the "@" prefix. */
export function getAiPromptText(text: string) {
  return text.trimStart().slice(AI_PROMPT_PREFIX.length).trim();
}

export type AiValuesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; reason?: string };

interface UseAiFilterValuesOpts {
  query: Lib.Query;
  stageIndex: number;
  column: DraftColumn | undefined;
  operator: DraftOperator | undefined;
  values: string[];
  onValues: (values: string[]) => void;
}

/**
 * Prototype: asks the LLM of the instance for the values of the filter in the
 * pill, from a natural language request after "@", like "@EU countries". The
 * LLM can only fill in the values: the column and the operator stay.
 */
export function useAiFilterValues({
  query,
  stageIndex,
  column,
  operator,
  values,
  onValues,
}: UseAiFilterValuesOpts) {
  const [suggestFilterValues] = useSuggestPrototypeFilterValuesMutation();
  const [state, setState] = useState<AiValuesState>({ status: "idle" });

  const ask = async (text: string) => {
    const prompt = getAiPromptText(text);
    if (
      prompt.length === 0 ||
      column == null ||
      operator == null ||
      operator.valueKind === "none" ||
      state.status === "loading"
    ) {
      return;
    }
    setState({ status: "loading" });
    try {
      const response = await suggestFilterValues({
        prompt,
        field_id: Lib.fieldValuesSearchInfo(query, column.column).fieldId,
        table_name:
          Lib.displayInfo(query, stageIndex, column.column).table
            ?.displayName ?? "",
        column_name: column.label,
        operator: getPillOperatorLabel(operator),
        value_kind: operator.valueKind,
        values,
        options: operator.options?.map((option) => option.value),
      }).unwrap();
      const newValues =
        response.status === "ok"
          ? response.values.filter((value) => isValidValue(operator, value))
          : [];
      if (newValues.length > 0) {
        setState({ status: "idle" });
        onValues(newValues);
      } else {
        setState({
          status: "error",
          message: t`Sorry, we couldn't recognize this request. Rephrase it, or set the values by hand.`,
          reason: response.status === "rejected" ? response.reason : undefined,
        });
      }
    } catch {
      setState({
        status: "error",
        message: t`The AI could not answer. Try again, or set the values by hand.`,
      });
    }
  };

  const reset = () => {
    if (state.status === "error") {
      setState({ status: "idle" });
    }
  };

  return { state, ask, reset };
}

import { useCallback, useState } from "react";
import { t } from "ttag";

import { useSuggestPrototypeFilterValuesMutation } from "metabase/api";
import { useSetting } from "metabase/settings";
import * as Lib from "metabase-lib";

import type { DraftColumn, DraftOperator } from "./types";
import { getPillOperatorLabel, isValidValue } from "./utils";

const AI_PROMPT_PREFIX = "?";

/**
 * Tells if the text of an input is a request to the AI, like "?EU". Without
 * an AI provider, "?" is an ordinary character.
 */
/** False when the instance has no AI provider. */
export function useIsAiEnabled() {
  return !!useSetting("llm-metabot-configured?");
}

/** True when the AI can create new filters, instead of the edited filter. */
export function useCanAskAi(editedFilter: Lib.FilterClause | undefined) {
  return useIsAiEnabled() && editedFilter == null;
}

export function useIsAiPrompt() {
  const isAiEnabled = useIsAiEnabled();
  return useCallback(
    (text: string) =>
      isAiEnabled && text.trimStart().startsWith(AI_PROMPT_PREFIX),
    [isAiEnabled],
  );
}

/**
 * The text that the input shows. The "?" prefix only switches the input to a
 * request to the AI, so the input does not show it.
 */
export function getAiInputText(text: string, isAiPromptText: boolean) {
  return isAiPromptText
    ? text.trimStart().slice(AI_PROMPT_PREFIX.length)
    : text;
}

/** The text of the pill from the text of an input that `getAiInputText` gives. */
export function fromAiInputText(inputText: string, isAiPromptText: boolean) {
  return isAiPromptText ? AI_PROMPT_PREFIX + inputText : inputText;
}

/** The request to the AI without the "?" prefix. */
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
 * pill, from a natural language request after "?", like "?EU countries". The
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
      operator.valueKind === "date-picker" ||
      state.status === "loading"
    ) {
      return;
    }
    setState({ status: "loading" });
    try {
      const response = await suggestFilterValues({
        prompt,
        field_id: Lib.fieldSearchInfo(query, column.column).fieldId,
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

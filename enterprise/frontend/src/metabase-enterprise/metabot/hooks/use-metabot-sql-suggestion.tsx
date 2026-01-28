import { isFulfilled, isRejected } from "@reduxjs/toolkit";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import type { UseMetabotSQLSuggestionOptions } from "metabase/metabot/hooks/use-metabot-sql-suggestion";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
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

import { METABOT_PROFILE_OVERRIDES } from "../constants";

import { useMetabotAgent } from "./use-metabot-agent";

type SubmitInputResult = Awaited<
  ReturnType<ReturnType<typeof useMetabotAgent>["submitInput"]>
>;

const responseHasCodeEdit = (action: SubmitInputResult) => {
  return (
    isFulfilled(action) &&
    action.payload.data?.processedResponse.data.some(
      (dp) =>
        typeof dp === "object" &&
        dp !== null &&
        "type" in dp &&
        (dp as { type: string }).type === "code_edit",
    )
  );
};

export function useMetabotSQLSuggestion({
  bufferId,
  onGenerated,
}: UseMetabotSQLSuggestionOptions) {
  const { isDoingScience, submitInput, cancelRequest } = useMetabotAgent("sql");

  const [hasError, setHasError] = useState(false);

  const dispatch = useMetabotDispatch();
  const source = useMetabotSelector((state) =>
    getMetabotSuggestedCodeEdit(state, bufferId),
  )?.value;

  const generate = useCallback(
    async ({
      prompt,
    }: {
      prompt: string;
      sourceSql?: string;
      referencedEntities?: unknown;
    }) => {
      setHasError(false);
      const action = await submitInput(prompt, {
        profile: METABOT_PROFILE_OVERRIDES.SQL,
        preventOpenSidebar: true,
      });
      if (
        isRejected(action) ||
        (isFulfilled(action) && !action.payload?.success) ||
        !responseHasCodeEdit(action)
      ) {
        setHasError(true);
      } else {
        onGenerated?.();
      }
    },
    [submitInput, onGenerated],
  );

  const reject = useCallback(() => {
    dispatch(
      addDeveloperMessage({
        agentId: "sql",
        message: `User rejected the following suggestion:\n\n${source}`,
      }),
    );
  }, [dispatch, source]);

  const clear = useCallback(() => {
    dispatch(removeSuggestedCodeEdit(bufferId));
  }, [dispatch, bufferId]);

  const reset = useCallback(() => {
    dispatch(removeSuggestedCodeEdit(bufferId));
    dispatch(resetConversation({ agentId: "sql" }));
  }, [dispatch, bufferId]);

  const suggestionModels: SuggestionModel[] = useMemo(
    () => ["dataset", "card", "table"],
    [],
  );

  return {
    source,
    isLoading: isDoingScience,
    generate,
    error: hasError ? t`Something went wrong. Please try again.` : undefined,
    cancelRequest,
    clear,
    reject,
    reset,
    suggestionModels,
  };
}

import { useCallback, useMemo, useRef } from "react";
import { match } from "ts-pattern";

import { InteractiveQuestionInternal } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { StaticQuestionInternal } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type {
  MetabotChartProps,
  MetabotMessage,
  UseMetabotResult,
} from "embedding-sdk-bundle/types/metabot";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import type { MetabotChatMessage } from "metabase/metabot/state/types";

/**
 * Public-facing hook for interacting with Metabot in the SDK.
 *
 * Provides a stable, SDK-friendly API for sending messages, managing
 * conversation state, and reading Metabot responses.
 */
export const useMetabot = (): UseMetabotResult => {
  const agent = useMetabotAgent();
  const { navigateToPath } = useMetabotReactions();
  const chartComponentsCache = useRef(
    new Map<string, ReturnType<typeof createChartComponent>>(),
  );

  const CurrentChart = useMemo(
    () =>
      createCurrentChartComponent(navigateToPath, chartComponentsCache.current),
    [navigateToPath],
  );

  const agentSubmitMessage = agent.submitInput;
  const submitMessage = useCallback(
    (message: string): Promise<void> => {
      return agentSubmitMessage(message, { preventOpenSidebar: true }).then(
        () => undefined,
      );
    },
    [agentSubmitMessage],
  );

  const agentRetryMessage = agent.retryMessage;
  const retryMessage = useCallback(
    (messageId: string): Promise<void> => {
      return agentRetryMessage(messageId);
    },
    [agentRetryMessage],
  );

  const messages = useMemo<MetabotMessage[]>(
    () =>
      agent.messages
        .filter(
          // tool_call messages are an internal debug variant — only surfaced
          // when metabot's `debugMode` is on, which is not exposed through
          // the SDK. Filter here so the public `MetabotMessage` union can
          // exclude them.
          (
            message,
          ): message is Exclude<MetabotChatMessage, { type: "tool_call" }> =>
            message.type !== "tool_call",
        )
        .map(mapMessage),
    [agent.messages],
  );

  return {
    submitMessage,
    retryMessage,
    cancelRequest: agent.cancelRequest,
    resetConversation: agent.resetConversation,

    messages,
    errorMessages: agent.errorMessages,
    isProcessing: agent.isDoingScience,

    CurrentChart,
  };
};

/**
 * Creates a chart component bound to a `navigateTo` path.
 * `drills={false}` (default) renders a StaticQuestion;
 * `drills={true}` renders an InteractiveQuestion.
 */
function createChartComponent(questionPath: string) {
  return function MetabotChart({ drills, ...rest }: MetabotChartProps) {
    if (drills) {
      return <InteractiveQuestionInternal query={questionPath} {...rest} />;
    }
    return <StaticQuestionInternal query={questionPath} {...rest} />;
  };
}

function getCachedChartComponent(
  questionPath: string,
  cache: Map<string, ReturnType<typeof createChartComponent>>,
) {
  if (!cache.has(questionPath)) {
    cache.set(questionPath, createChartComponent(questionPath));
  }
  return cache.get(questionPath)!;
}

function EmptyChart() {
  return null;
}

function createCurrentChartComponent(
  questionPath: string | null,
  cache: Map<string, ReturnType<typeof createChartComponent>>,
) {
  if (!questionPath) {
    return EmptyChart;
  }
  return getCachedChartComponent(questionPath, cache);
}

const mapMessage = (
  message: Exclude<MetabotChatMessage, { type: "tool_call" }>,
): MetabotMessage =>
  match(message)
    .with(
      { role: "user", type: "text" },
      ({ id, message }) =>
        ({ id, role: "user", type: "text", message }) as const,
    )
    .with(
      { role: "user", type: "action" },
      ({ id, message, userMessage }) =>
        ({
          id,
          role: "user",
          type: "action",
          message,
          actionLabel: userMessage,
        }) as const,
    )
    .with(
      { role: "agent", type: "text" },
      ({ id, message }) =>
        ({ id, role: "agent", type: "text", message }) as const,
    )
    .with(
      { role: "agent", type: "todo_list" },
      ({ id, payload }) =>
        ({
          id,
          role: "agent",
          type: "todo_list",
          payload,
        }) as const,
    )
    .with(
      { role: "agent", type: "edit_suggestion" },
      ({ id, payload }) =>
        ({
          id,
          role: "agent",
          type: "edit_suggestion",
          payload: {
            name: payload.suggestedTransform.name ?? "",
            description: payload.suggestedTransform.description ?? "",
          },
        }) as const,
    )
    .exhaustive();

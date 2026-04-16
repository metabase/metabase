import { useCallback, useMemo, useState } from "react";

import type { InteractiveQuestionProps } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import type { StaticQuestionProps } from "embedding-sdk-bundle/components/public/StaticQuestion";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type {
  MetabotAgentEditSuggestionMessage,
  MetabotAgentTextMessage,
  MetabotAgentTodoListMessage,
  MetabotAgentToolCallMessage,
  MetabotChartProps,
  MetabotMessage,
  MetabotUserActionMessage,
  MetabotUserTextMessage,
  UseMetabotResult,
} from "embedding-sdk-bundle/types/metabot";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import type { MetabotChatMessage } from "metabase/metabot/state/types";

/**
 * Creates a chart component bound to a `navigateTo` path.
 * `drills={false}` (default) renders a StaticQuestion;
 * `drills={true}` renders an InteractiveQuestion.
 */
function createChartComponent(questionPath: string) {
  return function MetabotChart({ drills, ...rest }: MetabotChartProps) {
    if (drills) {
      return (
        <InteractiveQuestion
          query={questionPath}
          {...(rest as Omit<
            InteractiveQuestionProps,
            "questionId" | "token" | "query"
          >)}
        />
      );
    }
    return (
      <StaticQuestion
        query={questionPath}
        {...(rest as Omit<
          StaticQuestionProps,
          "questionId" | "token" | "query"
        >)}
      />
    );
  };
}

function mapMessage(msg: MetabotChatMessage): MetabotMessage | null {
  if (msg.role === "user") {
    if (msg.type === "text") {
      const mapped: MetabotUserTextMessage = {
        id: msg.id,
        role: "user",
        type: "text",
        message: msg.message,
      };
      return mapped;
    }
    if (msg.type === "action") {
      const mapped: MetabotUserActionMessage = {
        id: msg.id,
        role: "user",
        type: "action",
        message: msg.message,
        actionLabel: msg.userMessage,
      };
      return mapped;
    }
    return null;
  }

  if (msg.role === "agent") {
    if (msg.type === "chart") {
      return {
        id: msg.id,
        role: "agent" as const,
        type: "chart" as const,
        questionPath: msg.navigateTo,
      };
    }
    if (msg.type === "text") {
      const mapped: MetabotAgentTextMessage = {
        id: msg.id,
        role: "agent",
        type: "text",
        message: msg.message,
      };
      return mapped;
    }
    if (msg.type === "todo_list") {
      const mapped: MetabotAgentTodoListMessage = {
        id: msg.id,
        role: "agent",
        type: "todo_list",
        payload: msg.payload,
      };
      return mapped;
    }
    if (msg.type === "edit_suggestion") {
      const mapped: MetabotAgentEditSuggestionMessage = {
        id: msg.id,
        role: "agent",
        type: "edit_suggestion",
        payload: {
          name: msg.payload.suggestedTransform.name ?? "",
          description: msg.payload.suggestedTransform.description ?? "",
        },
      };
      return mapped;
    }
    if (msg.type === "tool_call") {
      const mapped: MetabotAgentToolCallMessage = {
        id: msg.id,
        role: "agent",
        type: "tool_call",
        name: msg.name ?? "",
        status: msg.status,
      };
      return mapped;
    }
  }

  return null;
}

function mapMessages(messages: MetabotChatMessage[]): MetabotMessage[] {
  const result: MetabotMessage[] = [];
  for (const msg of messages) {
    const mapped = mapMessage(msg);
    if (mapped !== null) {
      result.push(mapped);
    }
  }
  return result;
}

/**
 * Public-facing hook for interacting with Metabot in the SDK.
 *
 * Provides a stable, SDK-friendly API for sending messages, managing
 * conversation state, and reading Metabot responses.
 */
export const useMetabot = (): UseMetabotResult => {
  const agent = useMetabotAgent("omnibot");
  const { navigateToPath } = useMetabotReactions();

  const [customInstructions, setCustomInstructions] = useState<
    string | undefined
  >();

  useRegisterMetabotContextProvider(
    // custom_instructions is supported by the backend but not yet typed in
    // MetabotChatContext — cast is intentional.
    async () =>
      customInstructions
        ? ({ custom_instructions: customInstructions } as never)
        : undefined,
    [customInstructions],
  );

  const currentChart = useMemo(() => {
    if (!navigateToPath) {
      return null;
    }
    return createChartComponent(navigateToPath);
  }, [navigateToPath]);

  const submitMessage = useCallback(
    (message: string): Promise<void> => {
      return agent
        .submitInput(message, { preventOpenSidebar: true })
        .then(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent.submitInput],
  );

  const retryMessage = useCallback(
    (messageId: string): Promise<void> => {
      return agent.retryMessage(messageId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent.retryMessage],
  );

  return {
    submitMessage,
    retryMessage,
    cancelRequest: agent.cancelRequest,
    resetConversation: agent.resetConversation,

    messages: mapMessages(agent.messages),
    errorMessages: agent.errorMessages,
    isProcessing: agent.isDoingScience,
    isLongConversation: agent.isLongConversation,

    currentChart,

    customInstructions,
    setCustomInstructions,
  };
};

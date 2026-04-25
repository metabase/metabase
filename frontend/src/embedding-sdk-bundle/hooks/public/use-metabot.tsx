import { useCallback, useMemo, useRef } from "react";
import { match } from "ts-pattern";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { InteractiveQuestionInternal } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { StaticQuestionInternal } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import type {
  MetabotChartProps,
  MetabotMessage,
  UseMetabotResult,
} from "embedding-sdk-bundle/types/metabot";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import type { MetabotChatMessage } from "metabase/metabot/state/types";

/**
 * Public-facing hook for interacting with Metabot in the SDK.
 *
 * Provides a stable, SDK-friendly API for sending messages, managing
 * conversation state, and reading Metabot responses.
 *
 * Note: all `useMetabot` instances in the same app share conversation state.
 * Mounting the hook in two components reads the same Redux state.
 * The backend exposes only a finite set of metabot agent types
 * (e.g. `default`, `embedded`, `slackbot`).
 */
export const useMetabot = (): UseMetabotResult => {
  const agent = useMetabotAgent();
  const { navigateToPath } = useMetabotReactions();
  const chartComponentsCache = useRef(
    new Map<string, ReturnType<typeof createChartComponent>>(),
  );

  const {
    state: { props: metabaseProviderProps },
  } = useMetabaseProviderPropsStore();

  const authConfig = metabaseProviderProps?.authConfig;

  const CurrentChart = useMemo(
    () =>
      navigateToPath && authConfig
        ? getCachedChartComponent(
            navigateToPath,
            chartComponentsCache.current,
            authConfig,
          )
        : null,
    [navigateToPath, authConfig],
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

  const agentResetConversation = agent.resetConversation;
  const resetConversation = useCallback(() => {
    chartComponentsCache.current.clear();
    agentResetConversation();
  }, [agentResetConversation]);

  const messages = useMemo<MetabotMessage[]>(
    () =>
      agent.messages
        .filter(isPublicMessage)
        .map((message) =>
          mapMessage(message, chartComponentsCache.current, authConfig),
        ),
    [agent.messages, authConfig],
  );

  return {
    submitMessage,
    retryMessage,
    cancelRequest: agent.cancelRequest,
    resetConversation,

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
 *
 * Wrapped in `ComponentProvider` so it behaves like other public SDK components.
 */
function createChartComponent(
  questionPath: string,
  authConfig: MetabaseAuthConfig,
) {
  return function MetabotChart({ drills, ...rest }: MetabotChartProps) {
    return (
      <ComponentProvider authConfig={authConfig}>
        {drills ? (
          <InteractiveQuestionInternal query={questionPath} {...rest} />
        ) : (
          <StaticQuestionInternal query={questionPath} {...rest} />
        )}
      </ComponentProvider>
    );
  };
}

function getCachedChartComponent(
  questionPath: string,
  cache: Map<string, ReturnType<typeof createChartComponent>>,
  authConfig: MetabaseAuthConfig,
) {
  if (!cache.has(questionPath)) {
    cache.set(questionPath, createChartComponent(questionPath, authConfig));
  }
  return cache.get(questionPath)!;
}

// These internal variants are intentionally not surfaced in the public SDK —
// see the comment on `MetabotMessage` in `embedding-sdk-bundle/types/metabot.ts`
// for the full rationale.
type PublicChatMessage = Exclude<
  MetabotChatMessage,
  { type: "tool_call" | "edit_suggestion" | "action" | "todo_list" }
>;

const isPublicMessage = (
  message: MetabotChatMessage,
): message is PublicChatMessage =>
  message.type !== "tool_call" &&
  message.type !== "edit_suggestion" &&
  message.type !== "action" &&
  message.type !== "todo_list";

const mapMessage = (
  message: PublicChatMessage,
  cache: Map<string, ReturnType<typeof createChartComponent>>,
  authConfig: MetabaseAuthConfig | undefined,
): MetabotMessage =>
  match(message)
    .with(
      { role: "user", type: "text" },
      ({ id, message }) =>
        ({ id, role: "user", type: "text", message }) as const,
    )
    .with(
      { role: "agent", type: "text" },
      ({ id, message }) =>
        ({ id, role: "agent", type: "text", message }) as const,
    )
    .with({ role: "agent", type: "chart" }, ({ id, navigateTo }) => {
      const Chart = authConfig
        ? getCachedChartComponent(navigateTo, cache, authConfig)
        : FallbackChartComponent;
      return {
        id,
        role: "agent",
        type: "chart",
        questionPath: navigateTo,
        Chart,
      } as const;
    })
    .exhaustive();

// Rendered only when `useMetabot` is called outside a `MetabaseProvider`
// with authConfig populated. In normal usage this branch is unreachable;
// keeping a placeholder satisfy message type.
const FallbackChartComponent = () => null;

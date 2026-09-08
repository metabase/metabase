import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useRef } from "react";
import { t } from "ttag";
import { once } from "underscore";

import { useToast } from "metabase/common/hooks";
import {
  trackExplorationAgentMessageSent,
  trackExplorationPlanEdited,
} from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { selectionToResearchPlanContext } from "metabase/explorations/research-plan-context";
import { indexDimensionsById } from "metabase/explorations/utils";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotChatEditor } from "metabase/metabot/components/MetabotChat/MetabotChatEditor";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type {
  MetabotAgentDataPartMessage,
  MetabotChatMessage,
  MetabotDataPart,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import { Box, Flex, Stack, Text } from "metabase/ui";
import type { RemoveFromResearchPlanResponse } from "metabase-types/api";

import S from "./NewExplorationChat.module.css";

export const EXPLORATIONS_AGENT_ID = "explorations";

const REMOVE_FROM_RESEARCH_PLAN_TOOL = "remove_from_research_plan";
const SET_RESEARCH_NAME_TOOL = "set_research_name";
const SELECT_RESEARCH_TIMELINES_TOOL = "select_research_timelines";

type MetabotToolCallMessageWithResult = MetabotDebugToolCallMessage & {
  result: string;
};

// `add_research_groups` delivers its picker hydration on a data part rather than in its tool
// result, because that result is also the agent's LLM context.
type ResearchPlanUpdateMessage = MetabotAgentDataPartMessage & {
  part: Extract<MetabotDataPart, { type: "data-research_plan_update" }>;
};

export interface NewExplorationChatProps {
  selection: ExplorationSelection;
}

export function NewExplorationChat({ selection }: NewExplorationChatProps) {
  const {
    addMetric,
    setName,
    addTimelinesById,
    removeTimelinesById,
    removeBlock,
    removeBlockDimensions,
    blocks,
    timelines,
    name,
  } = selection;
  const { canUseNlq, hasNlqAccess } = useUserMetabotPermissions();

  // Surface the in-progress draft plan to Metabot each turn so it can read and edit it.
  useRegisterMetabotContextProvider(
    async () => ({
      research_plan: selectionToResearchPlanContext({
        blocks,
        timelines,
        name,
      }),
    }),
    [blocks, timelines, name],
  );
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);

  const processedMessageIdsRef = useRef(new Set<string>());

  const {
    prompt,
    setPrompt,
    messages,
    conversationId,
    retryMessage,
    isDoingScience,
    submitInput,
    cancelRequest,
  } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  const handleSubmit = useCallback(() => {
    trackExplorationAgentMessageSent("plan_chat");
    submitInput(prompt, {
      preventOpenSidebar: true,
      profile: "explorations",
    });
  }, [prompt, submitInput]);

  const [sendToast] = useToast();

  const handleResearchPlanUpdateMessages = useCallback(
    (messages: ResearchPlanUpdateMessage[]) => {
      const trackMetricsEdited = once(() =>
        trackExplorationPlanEdited("agent", "metrics"),
      );

      try {
        for (const message of messages) {
          // data part shape verified by the backend
          const { metrics, dimension_groups, groups } = message.part.data;

          const metricsById = new Map(metrics.map((m) => [m.id, m] as const));
          const dimensionsById = indexDimensionsById(dimension_groups);

          for (const group of groups) {
            const metric = metricsById.get(group.metric_id);
            if (metric) {
              addMetric(metric, {
                dimensionsById,
                additionalSelectedDimensionIds: new Set(
                  group.dimension_ids ?? [],
                ),
                replace: group.replace_default_dimensions,
              });
              trackMetricsEdited();
            }
          }
        }
      } catch (error) {
        console.error(error);
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to add research groups`,
        });
      }
    },
    [addMetric, sendToast],
  );

  const handleRemoveFromResearchPlanToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      const trackMetricsEdited = once(() =>
        trackExplorationPlanEdited("agent", "metrics"),
      );
      const trackDimensionsEdited = once(() =>
        trackExplorationPlanEdited("agent", "dimensions"),
      );
      const trackTimelinesEdited = once(() =>
        trackExplorationPlanEdited("agent", "timelines"),
      );

      try {
        for (const message of messages) {
          // tool result shape verified by the backend
          const { block_ids, members, timeline_ids } = JSON.parse(
            message.result,
          ) as RemoveFromResearchPlanResponse;
          for (const blockId of block_ids ?? []) {
            removeBlock(blockId);
            trackMetricsEdited();
          }
          for (const member of members ?? []) {
            removeBlockDimensions(member.block_id, member.dimension_ids);
            trackDimensionsEdited();
          }
          if (timeline_ids?.length) {
            removeTimelinesById(timeline_ids);
            trackTimelinesEdited();
          }
        }
      } catch (error) {
        console.error(error);
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to update research plan`,
        });
      }
    },
    [removeBlock, removeBlockDimensions, removeTimelinesById, sendToast],
  );

  const handleSetExplorationNameToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      // there can only be one name, use the latest if multiple
      const lastMessage = messages.at(-1);
      if (!lastMessage) {
        return;
      }
      try {
        // tool result shape verified by the backend
        const { name } = JSON.parse(lastMessage.result) as { name: string };
        setName(name);
      } catch (error) {
        console.error(error);
        // don't bother with toast for this one, it's not critical
      }
    },
    [setName],
  );

  const handleSelectExplorationTimelinesToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      try {
        const timelineIds = messages.flatMap((message) => {
          // tool result shape verified by the backend
          const parsed = JSON.parse(message.result) as {
            timeline_ids: number[];
          };
          return parsed.timeline_ids;
        });
        if (timelineIds.length) {
          addTimelinesById(timelineIds);
          trackExplorationPlanEdited("agent", "timelines");
        }
      } catch (error) {
        console.error(error);
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to add timelines`,
        });
      }
    },
    [addTimelinesById, sendToast],
  );

  useEffect(() => {
    processedMessageIdsRef.current = new Set();
  }, [conversationId]);

  useEffect(() => {
    if (isDoingScience) {
      return;
    }

    const unprocessedMessages = messages.filter(
      (message) => !processedMessageIdsRef.current.has(message.id),
    );
    for (const message of unprocessedMessages) {
      processedMessageIdsRef.current.add(message.id);
    }

    handleResearchPlanUpdateMessages(
      unprocessedMessages.filter(isResearchPlanUpdateMessage),
    );
    handleRemoveFromResearchPlanToolCallMessages(
      unprocessedMessages.filter(isRemoveFromResearchPlanToolCallMessage),
    );
    handleSetExplorationNameToolCallMessages(
      unprocessedMessages.filter(isSetExplorationNameToolCallMessage),
    );
    handleSelectExplorationTimelinesToolCallMessages(
      unprocessedMessages.filter(isSelectExplorationTimelinesToolCallMessage),
    );
  }, [
    isDoingScience,
    handleResearchPlanUpdateMessages,
    handleRemoveFromResearchPlanToolCallMessages,
    handleSetExplorationNameToolCallMessages,
    handleSelectExplorationTimelinesToolCallMessages,
    messages,
  ]);

  const hasMessages = messages.length > 0;

  return (
    <>
      <Stack flex={1} mih={0} gap="lg" bg="background-secondary">
        {hasMessages ? (
          <Stack
            flex={1}
            mih={0}
            gap={0}
            px="xl"
            pt="xl"
            className={S.messagesContainer}
          >
            <Messages
              messages={messages}
              onRetryMessage={(id) =>
                retryMessage(id, { profile: "explorations" })
              }
              onContinueMessage={(prompt) =>
                submitInput(prompt, {
                  preventOpenSidebar: true,
                  profile: "explorations",
                })
              }
              isDoingScience={isDoingScience}
              debug={false}
              conversationId={conversationId}
            />
          </Stack>
        ) : (
          <Box flex={1} mih={0} />
        )}
        <Flex
          bg="background-primary"
          bd="1px solid border"
          bdrs="sm"
          mx="xl"
          pr="0.75rem"
          flex="none"
          className={S.inputContainer}
        >
          {canUseNlq ? (
            <MetabotChatEditor
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleSubmit}
              onStop={cancelRequest}
              placeholder={t`Ex. What recent events might be impacting our signups?`}
              suggestionConfig={{ suggestionModels: ["metric"] }}
            />
          ) : (
            <AIProviderConfigurationNotice
              p="0.75rem"
              featureName={t`the AI agent`}
              inline
              hasFeatureAccess={hasNlqAccess}
              onConfigureAi={openAiProviderConfigurationModal}
            />
          )}
        </Flex>
        <Flex mb="xl" mx="xl" align="center" justify="center">
          <Text
            c="text-secondary"
            size="sm"
            lh="1rem"
            ta="center"
          >{t`AI can make mistakes. Double check your plan and modify it as needed.`}</Text>
        </Flex>
      </Stack>
      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </>
  );
}

function isResearchPlanUpdateMessage(
  message: MetabotChatMessage,
): message is ResearchPlanUpdateMessage {
  return (
    message.role === "agent" &&
    message.type === "data_part" &&
    message.part.type === "data-research_plan_update"
  );
}

function isRemoveFromResearchPlanToolCallMessage(
  message: MetabotChatMessage,
): message is MetabotToolCallMessageWithResult {
  return (
    message.role === "agent" &&
    message.type === "tool_call" &&
    message.name === REMOVE_FROM_RESEARCH_PLAN_TOOL &&
    !message.is_error &&
    !!message.result
  );
}

function isSetExplorationNameToolCallMessage(
  message: MetabotChatMessage,
): message is MetabotToolCallMessageWithResult {
  return (
    message.role === "agent" &&
    message.type === "tool_call" &&
    message.name === SET_RESEARCH_NAME_TOOL &&
    !message.is_error &&
    !!message.result
  );
}

function isSelectExplorationTimelinesToolCallMessage(
  message: MetabotChatMessage,
): message is MetabotToolCallMessageWithResult {
  return (
    message.role === "agent" &&
    message.type === "tool_call" &&
    message.name === SELECT_RESEARCH_TIMELINES_TOOL &&
    !message.is_error &&
    !!message.result
  );
}

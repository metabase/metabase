import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useRef } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  trackExplorationAgentMessageSent,
  trackExplorationPlanEdited,
} from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { selectionToResearchPlanContext } from "metabase/explorations/research-plan-context";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotChatEditor } from "metabase/metabot/components/MetabotChat/MetabotChatEditor";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotThinking } from "metabase/metabot/components/MetabotChat/MetabotThinking";
import { useRegisterMetabotContextProvider } from "metabase/metabot/context";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type {
  MetabotChatMessage,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import { Box, Flex, Stack, Text } from "metabase/ui";
import type {
  AddResearchGroupsResponse,
  DimensionId,
  ExplorationDimensionGroup,
  ExplorationMetric,
  RemoveFromResearchPlanResponse,
} from "metabase-types/api";

import S from "./NewExplorationChat.module.css";

export const EXPLORATIONS_AGENT_ID = "explorations";

const ADD_RESEARCH_GROUPS_TOOL = "add_research_groups";
const REMOVE_FROM_RESEARCH_PLAN_TOOL = "remove_from_research_plan";
const SET_RESEARCH_NAME_TOOL = "set_research_name";
const SELECT_RESEARCH_TIMELINES_TOOL = "select_research_timelines";

type MetabotToolCallMessageWithResult = MetabotDebugToolCallMessage & {
  result: string;
};

export interface NewExplorationChatProps {
  selection: ExplorationSelection;
}

export function NewExplorationChat({ selection }: NewExplorationChatProps) {
  const {
    addMetric,
    addDimension,
    setName,
    addTimelinesById,
    removeTimelinesById,
    removeBlock,
    removeBlockMembers,
    blocks,
    timelines,
    name,
  } = selection;
  const { canUseNlq } = useUserMetabotPermissions();

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
  const nextUnprocessedMessageIndexRef = useRef(0);
  const {
    prompt,
    setPrompt,
    messages,
    retryMessage,
    isDoingScience,
    activeToolCalls,
    submitInput,
    cancelRequest,
  } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  const handleSubmit = useCallback(() => {
    trackExplorationAgentMessageSent();
    submitInput(prompt, {
      preventOpenSidebar: true,
      profile: "explorations",
    });
  }, [prompt, submitInput]);

  const [sendToast] = useToast();

  const handleAddResearchGroupsToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      if (messages.length === 0) {
        return;
      }

      let editedMetrics = false;
      let editedDimensions = false;

      try {
        for (const message of messages) {
          // Unjustified type cast. FIXME
          const { metrics, dimension_groups, groups } = JSON.parse(
            message.result,
          ) as AddResearchGroupsResponse;

          const metricsById = new Map(metrics.map((m) => [m.id, m] as const));
          const dimensionsById = new Map(
            dimension_groups
              .flatMap((g) => g.dimensions)
              .map((d) => [d.id, d] as const),
          );
          // Any dimension id (not just the head) -> its dimension group, so a dimension-anchored
          // group authored on any member resolves to the whole group, like the manual picker.
          const groupByDimensionId = new Map<
            DimensionId,
            ExplorationDimensionGroup
          >();
          for (const group of dimension_groups) {
            for (const d of group.dimensions) {
              groupByDimensionId.set(d.id, group);
            }
          }
          const metricsByDimension = new Map<
            DimensionId,
            ExplorationMetric[]
          >();
          for (const metric of metrics) {
            for (const id of metric.dimension_ids) {
              const list = metricsByDimension.get(id);
              if (list) {
                list.push(metric);
              } else {
                metricsByDimension.set(id, [metric]);
              }
            }
          }

          for (const group of groups) {
            if (group.anchor === "metric") {
              const metric = metricsById.get(group.metric_id);
              if (metric) {
                addMetric(metric, {
                  dimensionsById,
                  additionalSelectedDimensionIds: new Set(
                    group.dimension_ids ?? [],
                  ),
                  replace: group.replace_default_dimensions,
                });
                editedMetrics = true;
              }
            } else {
              const dimensionGroup = groupByDimensionId.get(group.dimension_id);
              if (dimensionGroup?.dimensions[0]) {
                addDimension(dimensionGroup.dimensions[0], {
                  group: dimensionGroup,
                  metricsByDimension,
                  selectedMetricIds: group.metric_ids
                    ? new Set(group.metric_ids)
                    : undefined,
                });
                editedDimensions = true;
              }
            }
          }
        }
        if (editedMetrics) {
          trackExplorationPlanEdited("agent", "metrics");
        }
        if (editedDimensions) {
          trackExplorationPlanEdited("agent", "dimensions");
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
    [addMetric, addDimension, sendToast],
  );

  const handleRemoveFromResearchPlanToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      if (messages.length === 0) {
        return;
      }

      let editedMetrics = false;
      let editedDimensions = false;
      let editedTimelines = false;

      try {
        for (const message of messages) {
          // Unjustified type cast. FIXME
          const { block_ids, members, timeline_ids } = JSON.parse(
            message.result,
          ) as RemoveFromResearchPlanResponse;
          for (const blockId of block_ids ?? []) {
            removeBlock(blockId);
            if (blockId.startsWith("metric:")) {
              editedMetrics = true;
            } else if (blockId.startsWith("dim:")) {
              editedDimensions = true;
            }
          }
          for (const member of members ?? []) {
            removeBlockMembers(member.block_id, {
              metricIds: member.metric_ids,
              dimensionIds: member.dimension_ids,
            });
            if (member.metric_ids?.length) {
              editedMetrics = true;
            }
            if (member.dimension_ids?.length) {
              editedDimensions = true;
            }
          }
          if (timeline_ids?.length) {
            removeTimelinesById(timeline_ids);
            editedTimelines = true;
          }
        }
      } catch (error) {
        console.error(error);
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to update research plan`,
        });
        return;
      }

      if (editedMetrics) {
        trackExplorationPlanEdited("agent", "metrics");
      }
      if (editedDimensions) {
        trackExplorationPlanEdited("agent", "dimensions");
      }
      if (editedTimelines) {
        trackExplorationPlanEdited("agent", "timelines");
      }
    },
    [removeBlock, removeBlockMembers, removeTimelinesById, sendToast],
  );

  const handleSetExplorationNameToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      if (messages.length === 0) {
        return;
      }
      try {
        // Unjustified type cast. FIXME
        const parsed = JSON.parse(messages[0].result) as { name: string };
        setName(parsed.name);
      } catch (error) {
        console.error(error);
        // don't bother with toast for this one, it's not critical
      }
    },
    [setName],
  );

  const handleSelectExplorationTimelinesToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      if (messages.length === 0) {
        return;
      }

      try {
        const timelineIds = messages.flatMap((message) => {
          // Unjustified type cast. FIXME
          const parsed = JSON.parse(message.result) as {
            timeline_ids: number[];
          };
          return parsed.timeline_ids;
        });
        addTimelinesById(timelineIds);
        trackExplorationPlanEdited("agent", "timelines");
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
    if (nextUnprocessedMessageIndexRef.current > messages.length) {
      nextUnprocessedMessageIndexRef.current = 0;
    }

    if (isDoingScience) {
      return;
    }

    const unprocessedMessages = messages.slice(
      nextUnprocessedMessageIndexRef.current,
    );
    nextUnprocessedMessageIndexRef.current = messages.length;

    handleAddResearchGroupsToolCallMessages(
      unprocessedMessages.filter(isAddResearchGroupsToolCallMessage),
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
    handleAddResearchGroupsToolCallMessages,
    handleRemoveFromResearchPlanToolCallMessages,
    handleSetExplorationNameToolCallMessages,
    handleSelectExplorationTimelinesToolCallMessages,
    messages,
  ]);

  const hasMessages = messages.length > 0;

  return (
    <>
      <Stack flex={1} mih={0} gap="md" bg="background-secondary">
        {hasMessages ? (
          <Stack
            flex={1}
            mih={0}
            gap={0}
            px="lg"
            pt="lg"
            className={S.messagesContainer}
          >
            <Messages
              messages={messages}
              onRetryMessage={(id) =>
                retryMessage(id, { profile: "explorations" })
              }
              isDoingScience={isDoingScience}
              debug={false}
            />
            {isDoingScience && <MetabotThinking toolCalls={activeToolCalls} />}
          </Stack>
        ) : (
          <Box flex={1} mih={0} />
        )}
        <Flex
          bg="background-primary"
          bd="1px solid border"
          bdrs="md"
          mx="lg"
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
              onConfigureAi={openAiProviderConfigurationModal}
            />
          )}
        </Flex>
        <Flex mb="lg" mx="lg" align="center" justify="center">
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

function isAddResearchGroupsToolCallMessage(
  message: MetabotChatMessage,
): message is MetabotToolCallMessageWithResult {
  return (
    message.role === "agent" &&
    message.type === "tool_call" &&
    message.name === ADD_RESEARCH_GROUPS_TOOL &&
    !message.is_error &&
    !!message.result
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

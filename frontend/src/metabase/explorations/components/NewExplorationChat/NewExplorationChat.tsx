import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useRef } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  trackExplorationAgentMessageSent,
  trackExplorationPlanEdited,
} from "metabase/explorations/analytics";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotChatEditor } from "metabase/metabot/components/MetabotChat/MetabotChatEditor";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotThinking } from "metabase/metabot/components/MetabotChat/MetabotThinking";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type {
  MetabotChatMessage,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import { Box, Flex, Stack, Text } from "metabase/ui";
import type { GetExplorationDataResponse } from "metabase-types/api";

import S from "./NewExplorationChat.module.css";

export const EXPLORATIONS_AGENT_ID = "explorations";

const SELECT_RESEARCH_METRICS_TOOL = "select_research_metrics";
const SET_RESEARCH_NAME_TOOL = "set_research_name";
const SELECT_RESEARCH_TIMELINES_TOOL = "select_research_timelines";

type MetabotToolCallMessageWithResult = MetabotDebugToolCallMessage & {
  result: string;
};

export interface NewExplorationChatProps {
  selection: ExplorationSelection;
}

export function NewExplorationChat({ selection }: NewExplorationChatProps) {
  const { addMetric, setName, addTimelinesById } = selection;
  const { canUseNlq } = useUserMetabotPermissions();
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
  } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  const handleSubmit = useCallback(() => {
    trackExplorationAgentMessageSent();
    submitInput(prompt, {
      preventOpenSidebar: true,
      profile: "explorations",
    });
  }, [prompt, submitInput]);

  const [sendToast] = useToast();

  const handleSelectExplorationMetricsToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      if (messages.length === 0) {
        return;
      }

      trackExplorationPlanEdited("agent", "metrics");

      try {
        for (const message of messages) {
          const { metrics, dimension_groups } = JSON.parse(
            message.result,
          ) as GetExplorationDataResponse;
          const dimensionsById = new Map(
            dimension_groups
              .flatMap((g) => g.dimensions)
              .map((d) => [d.id, d] as const),
          );
          for (const metric of metrics) {
            addMetric(metric, { dimensionsById });
          }
        }
      } catch (error) {
        console.error(error);
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to add metrics`,
        });
      }
    },
    [addMetric, sendToast],
  );

  const handleSetExplorationNameToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      if (messages.length === 0) {
        return;
      }
      try {
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

      trackExplorationPlanEdited("agent", "timelines");

      try {
        const timelineIds = messages.flatMap((message) => {
          const parsed = JSON.parse(message.result) as {
            timeline_ids: number[];
          };
          return parsed.timeline_ids;
        });
        addTimelinesById(timelineIds);
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

    handleSelectExplorationMetricsToolCallMessages(
      unprocessedMessages.filter(isSelectExplorationMetricsToolCallMessage),
    );
    handleSetExplorationNameToolCallMessages(
      unprocessedMessages.filter(isSetExplorationNameToolCallMessage),
    );
    handleSelectExplorationTimelinesToolCallMessages(
      unprocessedMessages.filter(isSelectExplorationTimelinesToolCallMessage),
    );
  }, [
    isDoingScience,
    handleSelectExplorationMetricsToolCallMessages,
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
              onStop={() => {}}
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

function isSelectExplorationMetricsToolCallMessage(
  message: MetabotChatMessage,
): message is MetabotToolCallMessageWithResult {
  return (
    message.role === "agent" &&
    message.type === "tool_call" &&
    message.name === SELECT_RESEARCH_METRICS_TOOL &&
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

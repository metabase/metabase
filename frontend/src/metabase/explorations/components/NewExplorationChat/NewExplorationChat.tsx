import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { t } from "ttag";

import { metricApi } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type {
  ExplorationMetric,
  MetricDimension,
} from "metabase/explorations/types";
import { MetabotChatEditor } from "metabase/metabot/components/MetabotChat/MetabotChatEditor";
import { Messages } from "metabase/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotThinking } from "metabase/metabot/components/MetabotChat/MetabotThinking";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type {
  MetabotChatMessage,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import { useDispatch } from "metabase/redux";
import { Box, Stack } from "metabase/ui";
import type { MetricId } from "metabase-types/api/metric";

import S from "./NewExplorationChat.module.css";

export const EXPLORATIONS_AGENT_ID = "explorations";

const SELECT_EXPLORATION_METRICS_TOOL = "select_exploration_metrics";
const SET_EXPLORATION_NAME_TOOL = "set_exploration_name";

type MetabotToolCallMessageWithResult = MetabotDebugToolCallMessage & {
  result: string;
};

export interface NewExplorationChatProps {
  setMetrics: Dispatch<SetStateAction<ExplorationMetric[]>>;
  setDimensions: Dispatch<SetStateAction<MetricDimension[]>>;
  setName: Dispatch<SetStateAction<string | null>>;
}

export function NewExplorationChat({
  setMetrics,
  setDimensions,
  setName,
}: NewExplorationChatProps) {
  const dispatch = useDispatch();
  const nextUnprocessedMessageIndexRef = useRef(0);
  const {
    prompt,
    setPrompt,
    conversation,
    messages,
    errorMessages,
    retryMessage,
    isDoingScience,
    activeToolCalls,
    submitInput,
  } = useMetabotAgent(EXPLORATIONS_AGENT_ID);

  const handleSubmit = useCallback(() => {
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

      try {
        const metricIds = [
          ...new Set(
            messages.flatMap((message) =>
              getMetricIdsFromToolCallResult(message.result),
            ),
          ),
        ];
        Promise.all(
          metricIds.map((id) =>
            dispatch(metricApi.endpoints.getMetric.initiate(id)).unwrap(),
          ),
        )
          .then((metrics) => {
            setMetrics((prev) => {
              const prevMetricIds = new Set(prev.map((m) => m.id));
              const metricsToAdd = metrics.filter(
                (metric) => !prevMetricIds.has(metric.id),
              );
              return [...prev, ...metricsToAdd];
            });
            setDimensions((prev) => {
              const prevDimensionIds = new Set(prev.map((d) => d.id));
              const allDimensions = Array.from(
                new Set(metrics.flatMap((metric) => metric.dimensions)),
              );
              const dimensionsToAdd = allDimensions.filter(
                (dimension) => !prevDimensionIds.has(dimension.id),
              );
              return [...prev, ...dimensionsToAdd];
            });
          })
          .catch((error) => {
            console.error(error);
            sendToast({
              icon: "warning_triangle_filled",
              iconColor: "warning",
              message: t`Failed to add metrics to the Exploration`,
            });
          });
      } catch (error) {
        console.error(error);
        sendToast({
          icon: "warning_triangle_filled",
          iconColor: "warning",
          message: t`Failed to add metrics to the Exploration`,
        });
      }
    },
    [dispatch, setMetrics, setDimensions, sendToast],
  );

  const handleSetExplorationNameToolCallMessages = useCallback(
    (messages: MetabotToolCallMessageWithResult[]) => {
      if (messages.length === 0) {
        return;
      }
      try {
        const parsed = JSON.parse(messages[0].result);
        if (!parsed.name) {
          throw new Error("Name not found in tool call result");
        }
        if (typeof parsed.name !== "string") {
          throw new Error("Name must be a string");
        }
        // ignore repeated calls to this tool
        setName((prev) => prev ?? parsed.name);
      } catch (error) {
        console.error(error);
        // don't bother with toast for this one, it's not critical
      }
    },
    [setName],
  );

  useEffect(() => {
    // conversation.messages includes tool calls, which are filtered out of messages
    const allMessages = conversation.messages;
    if (nextUnprocessedMessageIndexRef.current > allMessages.length) {
      nextUnprocessedMessageIndexRef.current = 0;
    }

    if (isDoingScience) {
      return;
    }

    const unprocessedMessages = allMessages.slice(
      nextUnprocessedMessageIndexRef.current,
    );
    nextUnprocessedMessageIndexRef.current = allMessages.length;

    handleSelectExplorationMetricsToolCallMessages(
      unprocessedMessages.filter(isSelectExplorationMetricsToolCallMessage),
    );
    handleSetExplorationNameToolCallMessages(
      unprocessedMessages.filter(isSetExplorationNameToolCallMessage),
    );
  }, [
    isDoingScience,
    conversation.messages,
    sendToast,
    dispatch,
    setMetrics,
    setDimensions,
    handleSelectExplorationMetricsToolCallMessages,
    handleSetExplorationNameToolCallMessages,
  ]);

  return (
    <>
      {messages.length > 0 && (
        <Stack flex={1} mih={0} gap={0} px="md" className={S.messagesContainer}>
          <Messages
            messages={messages}
            errorMessages={errorMessages}
            onRetryMessage={retryMessage}
            isDoingScience={isDoingScience}
          />
          {isDoingScience && <MetabotThinking toolCalls={activeToolCalls} />}
        </Stack>
      )}
      <Box bg="background-primary" bd="1px solid border" bdrs="md" pr="md">
        <MetabotChatEditor
          value={prompt}
          onChange={setPrompt}
          onSubmit={handleSubmit}
          onStop={() => {}}
          suggestionConfig={{ suggestionModels: ["metric", "measure"] }}
        />
      </Box>
    </>
  );
}

function isSelectExplorationMetricsToolCallMessage(
  message: MetabotChatMessage,
): message is MetabotToolCallMessageWithResult {
  return (
    message.role === "agent" &&
    message.type === "tool_call" &&
    message.name === SELECT_EXPLORATION_METRICS_TOOL &&
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
    message.name === SET_EXPLORATION_NAME_TOOL &&
    !message.is_error &&
    !!message.result
  );
}

function getMetricIdsFromToolCallResult(result: string): MetricId[] {
  const parsed = JSON.parse(result);
  if (!parsed.metric_ids) {
    throw new Error("Metric IDs not found in tool call result");
  }
  if (!Array.isArray(parsed.metric_ids)) {
    throw new Error("Metric IDs must be an array");
  }
  if (parsed.metric_ids.some((id: number) => typeof id !== "number")) {
    throw new Error("Metric IDs must be numbers");
  }
  return parsed.metric_ids;
}

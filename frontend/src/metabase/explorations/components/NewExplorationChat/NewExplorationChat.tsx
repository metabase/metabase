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
import type { MetricOrMeasure } from "metabase/explorations/types";
import { toMetricOrMeasure } from "metabase/explorations/utils";
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

const SELECT_EXPLORATION_METRICS_TOOL = "select_exploration_metrics";

export interface NewExplorationChatProps {
  metrics: MetricOrMeasure[];
  setMetrics: Dispatch<SetStateAction<MetricOrMeasure[]>>;
}

export function NewExplorationChat({ setMetrics }: NewExplorationChatProps) {
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
  } = useMetabotAgent();

  const handleSubmit = useCallback(() => {
    submitInput(prompt, {
      preventOpenSidebar: true,
      profile: "explorations",
    });
  }, [prompt, submitInput]);

  const [sendToast] = useToast();

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

    const metricToolCallMessages = unprocessedMessages.filter(
      isSelectExplorationMetricsToolCallMessage,
    );
    if (metricToolCallMessages.length === 0) {
      return;
    }

    try {
      const metricIds = [
        ...new Set(
          metricToolCallMessages.flatMap((message) =>
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
            const metricsToAdd = metrics
              .filter((metric) => !prev.some((m) => m.id === metric.id))
              .map(toMetricOrMeasure);
            return [...prev, ...metricsToAdd];
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
  }, [isDoingScience, conversation.messages, sendToast, dispatch, setMetrics]);

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
): message is MetabotDebugToolCallMessage & { result: string } {
  return (
    message.role === "agent" &&
    message.type === "tool_call" &&
    message.name === SELECT_EXPLORATION_METRICS_TOOL &&
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

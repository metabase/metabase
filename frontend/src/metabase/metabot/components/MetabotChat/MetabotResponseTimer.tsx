import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  type MetabotMessage,
  isGeneratedCardPart,
} from "metabase/metabot/state";
import { Flex, Text } from "metabase/ui";
import { formatDurationLong } from "metabase/utils/formatting";

import Styles from "./MetabotChat.module.css";

type ResponseTiming = {
  startedAtMs: number;
  endedAtMs: number | undefined;
  firstChartAtMs: number | undefined;
};

const TICK_MS = 100;

const toResponseTiming = (message: MetabotMessage): ResponseTiming[] =>
  message.role === "agent" && message.responseStartedAtMs != null
    ? [
        {
          startedAtMs: message.responseStartedAtMs,
          endedAtMs: message.responseEndedAtMs,
          firstChartAtMs: message.firstChartAtMs,
        },
      ]
    : [];

export const getConversationResponseTimings = (
  messages: readonly MetabotMessage[],
): ResponseTiming[] => messages.flatMap(toResponseTiming);

export const getPromptResponseTimings = (
  messages: readonly MetabotMessage[],
  promptIndex: number,
): ResponseTiming[] => {
  const following = messages.slice(promptIndex + 1);
  const nextPromptOffset = following.findIndex(
    (message) => message.role === "user",
  );
  const responses =
    nextPromptOffset === -1 ? following : following.slice(0, nextPromptOffset);
  return responses.flatMap(toResponseTiming);
};

const getDurationMs = (
  { startedAtMs, endedAtMs }: ResponseTiming,
  nowMs: number,
) => Math.max(0, (endedAtMs ?? nowMs) - startedAtMs);

const getElapsedMs = (timings: readonly ResponseTiming[], nowMs: number) =>
  timings.reduce(
    (totalMs, timing) => totalMs + getDurationMs(timing, nowMs),
    0,
  );

/**
 * Response time spent before the first chart arrived: counts up while a response is in flight and stops at the first
 * chart. Undefined once every response has finished without one.
 */
const getPromptTimingGroups = (
  messages: readonly MetabotMessage[],
): ResponseTiming[][] =>
  messages.flatMap((message, index) =>
    message.role === "user" ? [getPromptResponseTimings(messages, index)] : [],
  );

const getTimeToFirstChartMs = (
  timings: readonly ResponseTiming[],
  nowMs: number,
): number | undefined => {
  let elapsedMs = 0;
  for (const timing of timings) {
    if (timing.firstChartAtMs != null) {
      return (
        elapsedMs + Math.max(0, timing.firstChartAtMs - timing.startedAtMs)
      );
    }
    elapsedMs += getDurationMs(timing, nowMs);
  }
  const isRunning = timings.some(({ endedAtMs }) => endedAtMs == null);
  return isRunning ? elapsedMs : undefined;
};

const useTickWhileRunning = (isRunning: boolean) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    setNowMs(Date.now());
    const intervalId = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(intervalId);
  }, [isRunning]);

  return nowMs;
};

const isRunning = (timings: readonly ResponseTiming[]) =>
  timings.some(({ endedAtMs }) => endedAtMs == null);

interface MetabotResponseTimerProps {
  timings: readonly ResponseTiming[];
  showTimeToFirstChart?: boolean;
}

export const MetabotResponseTimer = ({
  timings,
  showTimeToFirstChart = false,
}: MetabotResponseTimerProps) => {
  const nowMs = useTickWhileRunning(isRunning(timings));

  if (timings.length === 0) {
    return null;
  }

  const timeToFirstChartMs = showTimeToFirstChart
    ? getTimeToFirstChartMs(timings, nowMs)
    : undefined;

  return (
    <Flex className={Styles.responseTimer} gap="xs">
      <Text c="text-secondary" fz="sm" data-testid="metabot-response-timer">
        {formatDurationLong(getElapsedMs(timings, nowMs))}
      </Text>
      {timeToFirstChartMs != null && (
        <Text c="success" fz="sm" data-testid="metabot-first-chart-timer">
          {formatDurationLong(timeToFirstChartMs)}
        </Text>
      )}
    </Flex>
  );
};

/**
 * The chat's totals next to its title: response time, and in green the time its responses took to deliver a chart,
 * counting a response that delivered none as zero, then that chart time spread over every chart delivered.
 */
export const MetabotConversationTimer = ({
  messages,
}: {
  messages: readonly MetabotMessage[];
}) => {
  const timings = getConversationResponseTimings(messages);
  const nowMs = useTickWhileRunning(isRunning(timings));

  if (timings.length === 0) {
    return null;
  }

  const chartMs = getPromptTimingGroups(messages).reduce(
    (totalMs, group) => totalMs + (getTimeToFirstChartMs(group, nowMs) ?? 0),
    0,
  );
  const elapsedMs = getElapsedMs(timings, nowMs);
  const chartCount = messages
    .flatMap((message) => message.parts)
    .filter(isGeneratedCardPart).length;

  return (
    <Flex className={Styles.responseTimer} gap="xs">
      <Text c="text-secondary" fz="sm" data-testid="metabot-response-timer">
        {formatDurationLong(elapsedMs)}
      </Text>
      <Text c="success" fz="sm" data-testid="metabot-chart-total-timer">
        {formatDurationLong(chartMs)}
      </Text>
      {chartCount > 0 && (
        <Text c="success" fz="sm" data-testid="metabot-chart-average-timer">
          {t`${formatDurationLong(chartMs / chartCount)} / chart`}
        </Text>
      )}
    </Flex>
  );
};

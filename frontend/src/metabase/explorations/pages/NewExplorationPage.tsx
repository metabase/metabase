import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateExplorationMutation } from "metabase/api";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import { Center, Group, Stack, Text } from "metabase/ui";
import type { CreateExplorationRequest } from "metabase-types/api";

import { NewExplorationChat } from "../components/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import type { MetricDimension, MetricOrMeasure, Timeline } from "../types";

function buildRequest(
  prompt: string,
  metrics: MetricOrMeasure[],
  dimensions: MetricDimension[],
  timelines: Timeline[],
): CreateExplorationRequest {
  const metricCards = metrics.filter((m) => m.type === "metric");
  const trimmedPrompt = prompt.trim();
  return {
    name: trimmedPrompt.length > 0 ? trimmedPrompt : t`New exploration`,
    prompt: trimmedPrompt.length > 0 ? trimmedPrompt : null,
    metrics: metricCards.map((m) => ({
      card_id: m.id as number,
      dimension_mappings: m.dimension_mappings,
    })),
    dimensions: dimensions.map((d) => ({
      dimension_id: d.id,
      display_name: d["display-name"],
      effective_type: d["effective-type"],
      semantic_type: d["semantic-type"],
    })),
    timeline_ids: timelines.map((tl) => tl.id),
  };
}

export function NewExplorationPage() {
  const metabot = useMetabotAgent();
  const dispatch = useDispatch();
  const [metrics, setMetrics] = useState<MetricOrMeasure[]>([]);
  const [dimensions, setDimensions] = useState<MetricDimension[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [createExploration, { isLoading: isStarting }] =
    useCreateExplorationMutation();

  const handleStart = useCallback(async () => {
    const request = buildRequest(
      metabot.prompt,
      metrics,
      dimensions,
      timelines,
    );
    const exploration = await createExploration(request).unwrap();
    dispatch(push(`/explorations/${exploration.id}`));
  }, [
    createExploration,
    dispatch,
    metabot.prompt,
    metrics,
    dimensions,
    timelines,
  ]);

  const canStart = metrics.length > 0;

  return (
    <Center p="3rem" h="100%" bg="background-secondary">
      <Group h="100%" w="100%" maw="90rem" align="flex-start">
        <Stack flex={1} gap="lg">
          <Text size="xl" fw="bold">{t`What are you looking to learn?`}</Text>
          <NewExplorationChat
            prompt={metabot.prompt}
            setPrompt={metabot.setPrompt}
            metrics={metrics}
            setMetrics={setMetrics}
          />
        </Stack>
        <NewExplorationData
          metrics={metrics}
          setMetrics={setMetrics}
          dimensions={dimensions}
          setDimensions={setDimensions}
          timelines={timelines}
          setTimelines={setTimelines}
          onStart={handleStart}
          isStarting={isStarting}
          canStart={canStart}
        />
      </Group>
    </Center>
  );
}

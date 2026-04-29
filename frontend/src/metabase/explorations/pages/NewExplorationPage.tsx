import { useState } from "react";
import { t } from "ttag";

import { Center, Group, Stack, Text } from "metabase/ui";

import { NewExplorationChat } from "../components/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import type { ExplorationMetric, MetricDimension, Timeline } from "../types";

export function NewExplorationPage() {
  const [metrics, setMetrics] = useState<ExplorationMetric[]>([]);
  const [dimensions, setDimensions] = useState<MetricDimension[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);

  return (
    <Center p="3rem" h="100%" bg="background-secondary">
      <Group h="100%" w="100%" maw="90rem" align="flex-start" wrap="nowrap">
        <Stack h="100%" w="100%" flex={1} gap="lg">
          <Text size="xl" fw="bold">{t`What are you looking to learn?`}</Text>
          <NewExplorationChat metrics={metrics} setMetrics={setMetrics} />
        </Stack>
        <NewExplorationData
          metrics={metrics}
          setMetrics={setMetrics}
          dimensions={dimensions}
          setDimensions={setDimensions}
          timelines={timelines}
          setTimelines={setTimelines}
        />
      </Group>
    </Center>
  );
}

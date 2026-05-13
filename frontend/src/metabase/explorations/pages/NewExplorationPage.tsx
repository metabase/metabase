import { useState } from "react";

import { Center, Group } from "metabase/ui";
import type { MetricDimension, Timeline } from "metabase-types/api";

import { NewExplorationChat } from "../components/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import type { ExplorationMetric } from "../types";

export function NewExplorationPage() {
  const [metrics, setMetrics] = useState<ExplorationMetric[]>([]);
  const [dimensions, setDimensions] = useState<MetricDimension[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [name, setName] = useState<string | null>(null);

  return (
    <Center p="3rem" h="100%" bg="background-primary">
      <Group
        h="100%"
        w="100%"
        maw="90rem"
        align="stretch"
        wrap="nowrap"
        bdrs="md"
        gap={0}
      >
        <NewExplorationChat
          setMetrics={setMetrics}
          setDimensions={setDimensions}
          setName={setName}
        />
        <NewExplorationData
          metrics={metrics}
          setMetrics={setMetrics}
          dimensions={dimensions}
          setDimensions={setDimensions}
          timelines={timelines}
          setTimelines={setTimelines}
          name={name}
        />
      </Group>
    </Center>
  );
}

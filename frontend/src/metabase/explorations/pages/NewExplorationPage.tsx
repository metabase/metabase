import { useState } from "react";
import { t } from "ttag";

import { useMetabotAgent } from "metabase/metabot/hooks";
import { Group, Stack, Text } from "metabase/ui";

import { NewExplorationChat } from "../components/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import type { MetricDimension, MetricOrMeasure, Timeline } from "../types";

export function NewExplorationPage() {
  const metabot = useMetabotAgent();
  const [metrics, setMetrics] = useState<MetricOrMeasure[]>([]);
  const [dimensions, setDimensions] = useState<MetricDimension[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);

  return (
    <Group p="3rem" h="100%" align="flex-start" bg="background-secondary">
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
      />
    </Group>
  );
}

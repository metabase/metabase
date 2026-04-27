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
    <Stack p="3rem" h="100%" bg="background-secondary">
      <Text size="lg" fw="bold">{t`What are you looking to learn?`}</Text>
      <Group justify="center" gap="lg">
        <NewExplorationChat
          prompt={metabot.prompt}
          setPrompt={metabot.setPrompt}
          metrics={metrics}
          setMetrics={setMetrics}
        />
        <NewExplorationData
          metrics={metrics}
          setMetrics={setMetrics}
          dimensions={dimensions}
          setDimensions={setDimensions}
          timelines={timelines}
          setTimelines={setTimelines}
        />
      </Group>
    </Stack>
  );
}

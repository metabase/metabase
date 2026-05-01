import { useState } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { Center, Group, Stack } from "metabase/ui";
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
    <Center p="3rem" h="100%" bg="background-secondary">
      <Group h="100%" w="100%" maw="90rem" align="flex-start" wrap="nowrap">
        <Stack h="100%" w="100%" flex={1} gap="lg">
          <EditableText
            initialValue={name ?? t`What are you looking to learn?`}
            onChange={setName}
            placeholder="New Exploration"
            fw="bold"
            fz="h3"
            lh="h3"
            isDisabled={name == null}
          />
          <NewExplorationChat
            setMetrics={setMetrics}
            setDimensions={setDimensions}
            setName={setName}
          />
        </Stack>
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

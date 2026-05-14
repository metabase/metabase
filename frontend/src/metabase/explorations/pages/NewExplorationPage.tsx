import type { Location } from "history";
import { useEffect, useState } from "react";

import { QuestionModeSwitcher } from "metabase/metabot/components/QuestionModeSwitcher";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { Box, Center, Group, Paper, Stack } from "metabase/ui";
import type { MetricDimension, Timeline } from "metabase-types/api";

import { NewExplorationChat } from "../components/NewExplorationChat";
import { EXPLORATIONS_AGENT_ID } from "../components/NewExplorationChat/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import type { ExplorationMetric } from "../types";

export function NewExplorationPage(props: { location?: Location }) {
  return <NewExplorationPageInner key={props.location?.key} />;
}

function NewExplorationPageInner() {
  const [metrics, setMetrics] = useState<ExplorationMetric[]>([]);
  const [dimensions, setDimensions] = useState<MetricDimension[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [name, setName] = useState<string | null>(null);

  // Wipe the agent's conversation for this profile every time the page mounts
  const { resetConversation } = useMetabotAgent(EXPLORATIONS_AGENT_ID);
  useEffect(() => {
    resetConversation();
  }, [resetConversation]);

  return (
    <Stack h="100%" gap={0} bg="background-primary">
      <Box pt="lg" pb="3rem" ta="center">
        <QuestionModeSwitcher value="research" />
      </Box>
      <Center px="3rem" pb="3rem" flex={1} mih={0}>
        <Paper h="100%" w="100%" maw="70.5rem" bd="1px solid border">
          <Group
            h="100%"
            w="100%"
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
        </Paper>
      </Center>
    </Stack>
  );
}

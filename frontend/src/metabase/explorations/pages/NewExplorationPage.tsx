import type { Location } from "history";
import { useEffect, useState } from "react";

import { EditableText } from "metabase/common/components/EditableText";
import CS from "metabase/css/core/index.css";
import { QuestionModeSwitcher } from "metabase/metabot/components/QuestionModeSwitcher";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { Box, Center, Group, Paper, Stack } from "metabase/ui";
import type { MetricDimension, Timeline } from "metabase-types/api";

import { NewExplorationChat } from "../components/NewExplorationChat";
import { EXPLORATIONS_AGENT_ID } from "../components/NewExplorationChat/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import {
  EXPLORATION_NAME_MAX_LENGTH,
  getDefaultExplorationName,
} from "../constants";
import type { ExplorationMetric } from "../types";

export function NewExplorationPage(props: { location?: Location }) {
  return <NewExplorationPageInner key={props.location?.key} />;
}

function NewExplorationPageInner() {
  const [metrics, setMetrics] = useState<ExplorationMetric[]>([]);
  const [dimensions, setDimensions] = useState<MetricDimension[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [name, setName] = useState<string>(getDefaultExplorationName());

  // Wipe the agent's conversation for this profile every time the page mounts
  const { resetConversation, messages } = useMetabotAgent(
    EXPLORATIONS_AGENT_ID,
  );
  useEffect(() => {
    resetConversation();
  }, [resetConversation]);

  // hide the mode switcher once the user has started chatting or selecting data
  const shouldShowModeSwitcher =
    metrics.length === 0 &&
    dimensions.length === 0 &&
    timelines.length === 0 &&
    messages.length === 0;

  return (
    <Stack h="100%" gap={0} bg="background-primary" miw="67.375rem">
      {shouldShowModeSwitcher ? (
        <Box pt="lg" pb="3rem" ta="center">
          <QuestionModeSwitcher value="research" />
        </Box>
      ) : (
        <Box pt="2rem" pb="2.5rem" px="3rem">
          <EditableText
            initialValue={name}
            onChange={setName}
            placeholder={getDefaultExplorationName()}
            bd="none"
            fw="bold"
            fz="h2"
            lh="h2"
            maxLength={EXPLORATION_NAME_MAX_LENGTH}
          />
        </Box>
      )}
      <Center px="3rem" pb="3rem" flex={1} mih={0}>
        <Paper
          className={CS.overflowHidden}
          h="100%"
          w="100%"
          maw="93.75rem"
          mah="62.5rem"
          bd="1px solid border"
        >
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

import type { Location } from "history";
import { useEffect } from "react";

import { explorationApi } from "metabase/api/exploration";
import { timelineApi } from "metabase/api/timeline";
import { EditableText } from "metabase/common/components/EditableText";
import CS from "metabase/css/core/index.css";
import { QuestionModeSwitcher } from "metabase/metabot/components/QuestionModeSwitcher";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { Box, Center, Group, Paper, Stack } from "metabase/ui";

import { EXPLORATIONS_AGENT_ID } from "../components/NewExplorationChat/NewExplorationChat";
import { NewExplorationData } from "../components/NewExplorationData";
import { NewExplorationLeftTabs } from "../components/NewExplorationLeftTabs";
import {
  EXPLORATION_NAME_MAX_LENGTH,
  getDefaultExplorationName,
} from "../constants";
import { useExplorationNavigation, useExplorationSelection } from "../hooks";

export function NewExplorationPage(props: { location?: Location }) {
  return <NewExplorationPageInner key={props.location?.key} />;
}

function NewExplorationPageInner() {
  const selection = useExplorationSelection();
  const navigation = useExplorationNavigation();
  const { metrics, dimensions, timelines, name, setName } = selection;

  // Wipe the agent's conversation for this profile every time the page mounts
  const { resetConversation, messages } = useMetabotAgent(
    EXPLORATIONS_AGENT_ID,
  );
  useEffect(() => {
    resetConversation();
  }, [resetConversation]);

  // Warm the RTK Query cache for the Browse tab's three lists
  const prefetchExplorationData =
    explorationApi.usePrefetch("getExplorationData");
  const prefetchTimelines = timelineApi.usePrefetch("listTimelines");

  useEffect(() => {
    prefetchExplorationData({});
    prefetchTimelines({ include: "events" });
  }, [prefetchExplorationData, prefetchTimelines]);

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
            lh="1.875rem"
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
            <NewExplorationLeftTabs
              selection={selection}
              navigation={navigation}
            />
            <NewExplorationData selection={selection} navigation={navigation} />
          </Group>
        </Paper>
      </Center>
    </Stack>
  );
}

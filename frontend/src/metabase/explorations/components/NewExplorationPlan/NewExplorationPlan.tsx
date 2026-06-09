import { useEffect } from "react";
import { t } from "ttag";

import { explorationApi } from "metabase/api/exploration";
import { EditableText } from "metabase/common/components/EditableText";
import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Button,
  Center,
  Flex,
  Group,
  Icon,
  Paper,
  Stack,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  EXPLORATION_NAME_MAX_LENGTH,
  getDefaultExplorationName,
} from "../../constants";
import type { ExplorationSelection } from "../../hooks";
import { NewExplorationChat } from "../NewExplorationChat/NewExplorationChat";
import { NewExplorationData } from "../NewExplorationData";

interface NewExplorationPlanProps {
  selection: ExplorationSelection;
}

export function NewExplorationPlan({ selection }: NewExplorationPlanProps) {
  const { name, setName } = selection;

  const prefetchExplorationData =
    explorationApi.usePrefetch("getExplorationData");

  useEffect(() => {
    prefetchExplorationData({});
  }, [prefetchExplorationData]);

  return (
    <Stack h="100%" gap={0} bg="background-primary" miw="50rem">
      <Box pt="1.5rem" pb="1rem" px="3rem">
        <Group w="100%" maw="93.75rem" mx="auto">
          <Button
            component={ForwardRefLink}
            to={Urls.newExploration()}
            c="text-secondary"
            bd="none"
            leftSection={<Icon name="arrow_left" c="brand" />}
          >
            {t`All projects`}
          </Button>
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
        </Group>
      </Box>
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
            <Stack flex={1} miw={0} mih={0} h="100%" gap={0}>
              <NewExplorationChat selection={selection} />
            </Stack>
            <Flex flex={2} miw={0} mih={0}>
              <NewExplorationData selection={selection} />
            </Flex>
          </Group>
        </Paper>
      </Center>
    </Stack>
  );
}

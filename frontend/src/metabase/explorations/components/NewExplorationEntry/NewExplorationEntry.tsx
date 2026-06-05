import { useCallback, useState } from "react";
import { t } from "ttag";

import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { useUserSetting } from "metabase/common/hooks/use-setting/use-setting";
import { trackExplorationAgentMessageSent } from "metabase/explorations/analytics";
import { EXPLORATIONS_AGENT_ID } from "metabase/explorations/components/NewExplorationChat/NewExplorationChat";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { useMetabotAgent } from "metabase/metabot/hooks";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { Exploration } from "metabase-types/api";

import type { ExplorationSelection } from "../../hooks";
import type { NewExplorationMode } from "../../types";

import S from "./NewExplorationEntry.module.css";

interface NewExplorationEntryProps {
  selection: ExplorationSelection;
  setMode: (mode: NewExplorationMode) => void;
}

const MOCK_EXPLORATIONS: Pick<Exploration, "id" | "name" | "updated_at">[] =
  Array.from({ length: 25 }, (_, i) => {
    const updatedAt = new Date();
    updatedAt.setDate(updatedAt.getDate() - i * 7);
    return {
      id: i + 1,
      name: `Exploration ${i + 1}`,
      updated_at: updatedAt.toISOString(),
    };
  });

export function NewExplorationEntry({
  selection,
  setMode,
}: NewExplorationEntryProps) {
  const { collection, setCollection } = selection;
  const { prompt, setPrompt, submitInput } = useMetabotAgent(
    EXPLORATIONS_AGENT_ID,
  );
  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);

  const handleSubmit = useCallback(() => {
    trackExplorationAgentMessageSent();
    submitInput(prompt, {
      preventOpenSidebar: true,
      profile: "explorations",
    });
    setMode("plan");
  }, [prompt, submitInput, setMode]);

  return (
    <Stack h="100%" bg="background-primary" align="center" p="2rem">
      <Stack w="100%" maw="42rem" align="flex-start" gap="lg" mih={0}>
        <Button
          component={ForwardRefLink}
          to={Urls.newQuestion({ mode: "ask" })}
          c="text-secondary"
          bd="none"
          flex="none"
          leftSection={<Icon name="arrow_left" />}
        >
          {t`Explore`}
        </Button>
        <Text fz="xl" fw={600} c="text-primary">
          {t`What do you want to research?`}
        </Text>
        <Paper
          w="100%"
          bd="1px solid border"
          bdrs="0.75rem"
          p="0.5rem 1rem 1rem"
          className={S.inputContainer}
        >
          <MetabotPromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleSubmit}
            onStop={() => {}}
            placeholder={t`Ex. What recent events might be impacting our signups?`}
            suggestionConfig={{ suggestionModels: ["metric"] }}
            disabled={false}
          />
          <Flex justify="space-between" align="center">
            <Button
              c="text-secondary"
              bd="none"
              className={S.buttonHoverSecondary}
              leftSection={<Icon name="collection" />}
              onClick={() => setIsCollectionPickerOpen(true)}
            >
              {collection.name}
            </Button>
            <Flex gap="sm">
              <Button
                c="text-secondary"
                bd="none"
                className={S.buttonHoverSecondary}
                onClick={() => setMode("plan")}
              >
                {t`Manual setup`}
              </Button>
              <Button
                variant="filled"
                disabled={prompt.length === 0}
                onClick={handleSubmit}
              >
                {t`Create plan`}
              </Button>
            </Flex>
          </Flex>
        </Paper>
        <Banner shouldHide={MOCK_EXPLORATIONS.length > 0} />
        <ExplorationList explorations={MOCK_EXPLORATIONS} />
      </Stack>
      {isCollectionPickerOpen && (
        <CollectionPickerModal
          value={
            collection.id != null
              ? { id: collection.id, model: "collection" }
              : undefined
          }
          entityType="exploration"
          onClose={() => setIsCollectionPickerOpen(false)}
          onChange={(collection) => {
            setCollection({
              id: collection.id,
              name: collection.name,
            });
            setIsCollectionPickerOpen(false);
          }}
          options={{
            hasLibrary: false,
          }}
          isHiddenItem={(item) =>
            item.model === "collection" && item.namespace != null
          }
        />
      )}
    </Stack>
  );
}

function Banner({ shouldHide }: { shouldHide: boolean }) {
  const [hasDismissedBanner, setHasDismissedBanner] = useUserSetting(
    "dismissed-research-mode-banner",
  );

  if (hasDismissedBanner || shouldHide) {
    return null;
  }

  return (
    <Flex
      justify="space-between"
      align="center"
      gap="lg"
      bg="background-brand"
      px="lg"
      py="md"
      bd="1px solid border"
      bdrs="md"
    >
      <Text>
        {t`Research mode helps automate running and inspecting combinations of metrics, dimensions, and event timelines so you can use your brain for analysis, not busy work.`}
      </Text>
      <ActionIcon
        onClick={() => setHasDismissedBanner(true)}
        aria-label={t`Dismiss`}
      >
        <Icon name="close" c="icon-primary" />
      </ActionIcon>
    </Flex>
  );
}

interface ExplorationListProps {
  explorations: Pick<Exploration, "id" | "name" | "updated_at">[];
}

function ExplorationList({ explorations }: ExplorationListProps) {
  return (
    <Stack w="100%" mih={0}>
      <Text fz="1.125rem" fw={600} c="text-secondary">
        {t`Past research projects`}
      </Text>
      <Stack gap="sm" mih={0} className={S.explorationsContainer}>
        {explorations.map(({ id, name, updated_at }) => (
          <Box
            component={ForwardRefLink}
            to={Urls.exploration(id)}
            key={id}
            px="md"
            py="sm"
            bdrs="md"
            className={S.explorationLink}
          >
            <Text>{name}</Text>
            <Tooltip position="bottom" label={getFormattedTime(updated_at)}>
              <Text component="time" c="text-secondary" fz="sm">
                {`Last activity - ${getRelativeTime(updated_at)}`}
              </Text>
            </Tooltip>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

import { useCallback, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { trackExplorationAgentMessageSent } from "metabase/explorations/analytics";
import { EXPLORATIONS_AGENT_ID } from "metabase/explorations/components/NewExplorationChat/NewExplorationChat";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { Button, Flex, Icon, Paper, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import type { ExplorationSelection } from "../../hooks";
import type { NewExplorationMode } from "../../types";

import S from "./NewExplorationEntry.module.css";

interface NewExplorationEntryProps {
  selection: ExplorationSelection;
  setMode: (mode: NewExplorationMode) => void;
}

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
    <Stack h="100%" gap={0} bg="background-primary" align="center" p="3rem">
      <Stack w="100%" maw="42rem" align="flex-start" gap="lg">
        <Button
          component={ForwardRefLink}
          to={Urls.newQuestion({ mode: "ask" })}
          c="text-secondary"
          bd="none"
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
        >
          <Stack className={S.inputContainer}>
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
          </Stack>
        </Paper>
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
        />
      )}
    </Stack>
  );
}

import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type { MetabotAgentId } from "metabase/metabot/state";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./MetabotGreeting.module.css";

const SUGGESTED_PROMPTS_LIMIT = 4;

const getTitleText = () => {
  return _.sample([
    t`What would you like to know?`,
    t`What do you want to explore?`,
    t`What are you looking to learn?`,
  ]);
};

interface MetabotGreetingProps {
  agentId: MetabotAgentId;
  suggestionModels: SuggestionModel[];
}

export const MetabotGreeting = ({
  agentId,
  suggestionModels,
}: MetabotGreetingProps) => {
  const [title] = useState(getTitleText);
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);
  const metabot = useMetabotAgent(agentId);
  const { isConfigured, canUseNlq, hasNlqAccess } = useUserMetabotPermissions();

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery(
    {
      metabot_id: metabot.metabotId,
      limit: SUGGESTED_PROMPTS_LIMIT,
      sample: true,
    },
    { skip: !isConfigured },
  );
  const suggestedPrompts = suggestedPromptsReq.currentData?.prompts;

  const handleSubmit = () => metabot.submitInput(metabot.prompt);
  const inputDisabled =
    metabot.prompt.trim().length === 0 || metabot.isDoingScience;

  return (
    <Box className={S.page}>
      <Stack gap="lg" className={S.inputWrapper}>
        <Flex align="center" justify="space-between" mt="3.5rem">
          <Text fz="xl" fw={600} c="text-primary">
            {title}
          </Text>
          <Button
            component={ForwardRefLink}
            to={Urls.newExploration()}
            bd="none"
            leftSection={<Icon name="learn" c="brand" />}
          >
            {t`Research`}
          </Button>
        </Flex>
        <Paper className={S.inputContainer}>
          <Box className={S.editorWrapper}>
            {!canUseNlq ? (
              <AIProviderConfigurationNotice
                py="0.5rem"
                mih="7.5rem"
                featureName={t`AI explorations`}
                inline
                hasFeatureAccess={hasNlqAccess}
                onConfigureAi={openAiProviderConfigurationModal}
              />
            ) : (
              <MetabotPromptInput
                ref={metabot.promptInputRef}
                value={metabot.prompt}
                autoFocus
                disabled={metabot.isDoingScience}
                placeholder={t`Ask about your data, and type @ to mention an item`}
                onChange={metabot.setPrompt}
                onSubmit={handleSubmit}
                onStop={metabot.cancelRequest}
                suggestionConfig={{ suggestionModels }}
                data-testid="metabot-chat-input"
              />
            )}
          </Box>
          <Box className={S.inputActions}>
            <ActionIcon
              className={S.sendButton}
              variant="filled"
              size="2rem"
              disabled={!canUseNlq || inputDisabled}
              loading={metabot.isDoingScience}
              onClick={handleSubmit}
              data-testid="metabot-send-message"
              aria-label={t`Send`}
            >
              <Icon name="arrow_up" />
            </ActionIcon>
          </Box>
        </Paper>

        <Box
          className={S.promptSuggestionsContainer}
          data-testid="metabot-prompt-suggestions"
        >
          {canUseNlq
            ? suggestedPrompts?.map(({ prompt }, index) => (
                <UnstyledButton
                  key={index}
                  className={S.promptSuggestion}
                  style={{ animationDelay: `${index * 75}ms` }}
                  onClick={() => metabot.submitInput(prompt)}
                >
                  <Text>{prompt}</Text>
                </UnstyledButton>
              ))
            : null}
        </Box>
      </Stack>
      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
};

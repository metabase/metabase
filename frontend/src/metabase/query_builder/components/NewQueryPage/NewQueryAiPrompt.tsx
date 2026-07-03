import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { ActionIcon, Box, Icon, Paper, Text, UnstyledButton } from "metabase/ui";

import S from "./NewQueryAiPrompt.module.css";

const SUGGESTION_MODELS: SuggestionModel[] = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
];

type Props = {
  engaged?: boolean;
};

function getPlaceholder(engaged: boolean, isResearchActive: boolean) {
  if (engaged) {
    return t`How can I help? Type @ to mention items.`;
  }
  if (isResearchActive) {
    return t`Describe the question you're trying to research, type @ to mention items`;
  }
  return t`Ask about your data, type @ to mention items`;
}

export function NewQueryAiPrompt({ engaged = false }: Props) {
  const [
    isAiProviderConfigurationModalOpen,
    {
      close: closeAiProviderConfigurationModal,
      open: openAiProviderConfigurationModal,
    },
  ] = useDisclosure(false);
  const [isResearchActive, setIsResearchActive] = useState(false);
  const metabot = useMetabotAgent("ask");
  const metabotName = useMetabotName();
  const { isConfigured } = useUserMetabotPermissions();

  const handleSubmit = () => metabot.submitInput(metabot.prompt);
  const inputDisabled =
    metabot.prompt.trim().length === 0 || metabot.isDoingScience;

  return (
    <Box>
      <Paper
        className={cx(S.inputContainer, engaged && S.inputContainerEngaged)}
        data-testid="new-query-ai-prompt"
      >
        <Box className={S.editorWrapper}>
          {!isConfigured ? (
            <AIProviderConfigurationNotice
              py="0.5rem"
              featureName={t`AI exploration`}
              inline
              onConfigureAi={openAiProviderConfigurationModal}
            />
          ) : (
            <MetabotPromptInput
              ref={metabot.promptInputRef}
              value={metabot.prompt}
              autoFocus={!engaged}
              disabled={metabot.isDoingScience}
              placeholder={getPlaceholder(engaged, isResearchActive)}
              onChange={metabot.setPrompt}
              onSubmit={handleSubmit}
              onStop={metabot.cancelRequest}
              suggestionConfig={{ suggestionModels: SUGGESTION_MODELS }}
              data-testid="metabot-chat-input"
            />
          )}
        </Box>
        <Box className={cx(S.inputActions, engaged && S.inputActionsEngaged)}>
          {!engaged && (
            <Box className={S.inputActionsLeft}>
              <UnstyledButton
                type="button"
                className={S.modelButton}
                aria-label={t`Model`}
              >
                <span>Claude Opus 4.7</span>
                <Icon name="chevrondown" size={12} />
              </UnstyledButton>
              <UnstyledButton
                type="button"
                className={cx(
                  S.researchButton,
                  isResearchActive && S.researchButtonActive,
                )}
                aria-pressed={isResearchActive}
                aria-label={t`Research`}
                onClick={() => setIsResearchActive((active) => !active)}
              >
                <Icon name="insight" size={14} />
                <span>{t`Research`}</span>
              </UnstyledButton>
            </Box>
          )}
          <ActionIcon
            className={S.sendButton}
            variant="filled"
            size="2rem"
            disabled={!isConfigured || inputDisabled}
            loading={metabot.isDoingScience}
            onClick={handleSubmit}
            data-testid="metabot-send-message"
            aria-label={t`Send`}
          >
            <Icon name="arrow_up" />
          </ActionIcon>
        </Box>
      </Paper>
      {engaged && (
        <Text mt="sm" pb="0.5rem" fz="sm" c="text-secondary" ta="center">
          {t`${metabotName} isn't perfect. Double-check results.`}
        </Text>
      )}

      <AIProviderConfigurationModal
        opened={isAiProviderConfigurationModalOpen}
        onClose={closeAiProviderConfigurationModal}
      />
    </Box>
  );
}

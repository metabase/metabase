import cx from "classnames";
import _ from "underscore";
import { t } from "ttag";

import { Box, Button, Icon, Paper, Stack, Text } from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import { MetabotPromptInput } from "metabase-enterprise/metabot/components/MetabotPromptInput";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import S from "./MetabotQueryBuilder.module.css";
import { useEffect, useState } from "react";

const defaultSuggestionModels = [
  "dataset",
  "metric",
  "card",
  "table",
  "database",
  "dashboard",
] as const;

const getTitleText = () => {
  return _.sample([
    t`Ask your data anything`,
    t`What can I help you with?`,
    t`Go ahead, ask anything`,
    t`So, what do you want to know?`,
    t`What's on your mind?`,
    t`What should we explore?`,
  ]);
};

export const MetabotQueryBuilder = () => {
  const {
    setVisible,
    metabotId,
    isDoingScience,
    prompt,
    setPrompt,
    promptInputRef,
    submitInput,
    cancelRequest,
  } = useMetabotAgent();

  const [title] = useState(getTitleText);

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: 4,
    sample: true,
  });

  const suggestedPrompts = suggestedPromptsReq.currentData?.prompts;
  const handleSuggestionClick = (prompt: string) => {
    setPrompt(prompt);
    submitInput(prompt, {
      profile: "unset", // TODO: set to a new nlq profile
      preventOpenSidebar: true,
    });
  };

  const canSubmit = prompt.trim().length > 0 && !isDoingScience;

  const handleEditorSubmit = () => {
    submitInput(
      `DEVELOPER MESSAGE: You MUST produce a new notebook question and navigate the user to it based on the following prompt. ABSOLUTELY NO EXCEPTIONS.\n\n${prompt}`,
      { preventOpenSidebar: true },
    );
  };

  useEffect(
    function autoCloseMetabotOnMount() {
      setVisible(false);
    },
    [setVisible],
  );

  return (
    <Box className={S.page}>
      <Box className={S.centeredContainer}>
        <Box className={S.greeting}>
          <Icon name="metabot" className={S.greetingIcon} c="brand" />
          <Text fz={32} fw={600} c="text-dark">
            {title}
          </Text>
        </Box>

        <Stack gap="lg" className={S.inputWrapper}>
          <Paper
            className={cx(
              S.inputContainer,
              isDoingScience && S.inputContainerLoading,
            )}
          >
            <Box className={S.editorWrapper}>
              <MetabotPromptInput
                ref={promptInputRef}
                value={prompt}
                autoFocus
                disabled={isDoingScience}
                placeholder={t`Ask anything`}
                onChange={setPrompt}
                onSubmit={handleEditorSubmit}
                onStop={cancelRequest}
                suggestionConfig={{
                  suggestionModels: [...defaultSuggestionModels],
                }}
              />
            </Box>
            <Box className={S.inputActions}>
              <Button
                className={S.sendButton}
                variant="filled"
                disabled={!canSubmit}
                loading={isDoingScience}
                onClick={handleEditorSubmit}
                data-testid="metabot-send-message"
              >
                <Icon name="arrow_up" />
              </Button>
            </Box>
          </Paper>

          <Box className={S.promptSuggestionsContainer}>
            {suggestedPrompts?.map(({ prompt }, index) => (
              <Text
                key={index}
                className={S.promptSuggestion}
                style={{ animationDelay: `${index * 75}ms` }}
                onClick={() => handleSuggestionClick(prompt)}
              >
                {prompt}
              </Text>
            ))}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};

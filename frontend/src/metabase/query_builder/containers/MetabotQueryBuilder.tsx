import cx from "classnames";
import _ from "underscore";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon, Paper, Stack, Text } from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import { MetabotPromptInput } from "metabase-enterprise/metabot/components/MetabotPromptInput";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import S from "./MetabotQueryBuilder.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "metabase/router";
import { isFulfilled } from "@reduxjs/toolkit";
import { Urls } from "metabase-enterprise/urls";
import { push } from "react-router-redux";

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

// TODO: clean this up, share some code with responseHasCodeEdit or something...
type SubmitInputResult = Awaited<
  ReturnType<ReturnType<typeof useMetabotAgent>["submitInput"]>
>;
const responseHasNavigateTo = (action: SubmitInputResult) => {
  return (
    isFulfilled(action) &&
    action.payload.data?.processedResponse.data.some(
      (dp) =>
        typeof dp === "object" &&
        dp !== null &&
        "type" in dp &&
        (dp as { type: string }).type === "code_edt",
    )
  );
};

export const MetabotQueryBuilder = () => {
  const dispatch = useDispatch();
  const {
    setVisible,
    setProfileOverride,
    resetConversation,
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

  const handleSubmitPrompt = async (prompt: string) => {
    resetConversation();
    setProfileOverride("nlq");
    const action = await submitInput(prompt, { preventOpenSidebar: true });
    if (!responseHasNavigateTo(action)) {
      dispatch(
        push(
          Urls.newQuestion({
            mode: "notebook",
            creationType: "custom_question",
            cardType: "question",
          }),
        ),
      );
    }
  };

  const handleEditorSubmit = () => handleSubmitPrompt(prompt);

  const handleSuggestionClick = (prompt: string) => {
    setPrompt(prompt);
    handleSubmitPrompt(prompt);
  };

  const inputDisabled = prompt.trim().length === 0 || isDoingScience;

  useEffect(
    function autoCloseMetabotOnMount() {
      setVisible(false);
    },
    [setVisible],
  );

  const { router, routes } = useRouter();
  const currentRoute = routes.at(-1);
  useEffect(
    () =>
      router.setRouteLeaveHook(currentRoute, (nextLocation) => {
        if (nextLocation?.pathname.startsWith("/question")) {
          setVisible(true);
        }
        return true;
      }),
    [router, currentRoute, setVisible],
  );

  return (
    <Box className={S.page}>
      <Box className={S.centeredContainer}>
        <Box className={S.greeting}>
          <Icon name="metabot" className={S.greetingIcon} c="brand" />
          <Text fz={{ base: "xl", sm: 32 }} fw={600} c="text-dark">
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
                disabled={inputDisabled}
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

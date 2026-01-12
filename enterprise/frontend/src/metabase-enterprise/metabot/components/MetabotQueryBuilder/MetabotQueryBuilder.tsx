import { isFulfilled, isRejected } from "@reduxjs/toolkit";
import cx from "classnames";
import { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { isMatching } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { useDispatch } from "metabase/lib/redux";
import { useRouter } from "metabase/router";
import {
  Box,
  Button,
  Icon,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import { Urls } from "metabase-enterprise/urls";

import { useMetabotAgent } from "../../hooks";
import { MetabotPromptInput } from "../MetabotPromptInput";

import S from "./MetabotQueryBuilder.module.css";

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
    t`What would you like to know?`,
    t`What do you want to explore?`,
    t`What are you looking to learn?`,
  ]);
};

type SubmitInputResult = Awaited<
  ReturnType<ReturnType<typeof useMetabotAgent>["submitInput"]>
>;

const responseHasNavigateTo = (action: SubmitInputResult) =>
  isFulfilled(action) &&
  action.payload.data?.processedResponse.data?.some(
    isMatching({ type: "navigate_to" }),
  );

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
  const [hasError, setHasError] = useState(false);

  const suggestedPromptsReq = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabotId,
    limit: 4,
    sample: true,
  });
  const suggestedPrompts = suggestedPromptsReq.currentData?.prompts;
  const suggestedPromptCount = suggestedPrompts?.length ?? 0;

  const handleSubmitPrompt = async (prompt: string) => {
    // start new nlq convo
    resetConversation();
    setProfileOverride("nlq");
    setHasError(false);

    // work around to show prompt during loading state - this is due to
    // normally we want the prompt to be cleared in a conversation
    // but in this case we want to show it in the input while responding
    // so it looks like we're processing the prompt / suggested prompt
    const req = submitInput(prompt, { preventOpenSidebar: true });
    setPrompt(prompt);
    const action = await req;
    setPrompt("");

    if (isRejected(action)) {
      return setHasError(true);
    }

    if (!action.payload.success) {
      if (action.payload.shouldRetry) {
        setPrompt(prompt);
      }
      return setHasError(true);
    }

    // as a fallback, if we receive no new query, we'll take the user
    // to an empty notebook query and show the chat sidebar as it's
    // highly likely the chat contains a response asking for clarification
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
      setVisible(true);
    }
  };

  const handleEditorSubmit = () => handleSubmitPrompt(prompt);

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
    function cancelRequestOnRouteLeave() {
      return router.setRouteLeaveHook(currentRoute, (nextLocation) => {
        const isNavigatingToQuestion =
          nextLocation?.pathname.startsWith("/question");
        if (isDoingScience) {
          if (isNavigatingToQuestion) {
            // we want to open the sidebar at this point as the agent could be sending a
            // navigate_to before the response has been fully completed
            setVisible(true);
          } else {
            cancelRequest();
            resetConversation(); // clear any partial response and reset profile
          }
        }
        return true;
      });
    },
    [
      router,
      currentRoute,
      setVisible,
      cancelRequest,
      resetConversation,
      isDoingScience,
    ],
  );

  return (
    <Box className={S.page}>
      <Box className={S.centeredContainer}>
        <Box className={S.greeting}>
          <MetabotLogo className={S.greetingIcon} />
          <Text fz={{ base: "xl", sm: 32 }} fw={600} c="text-primary">
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
                placeholder={t`Ask about your data`}
                onChange={setPrompt}
                onSubmit={handleEditorSubmit}
                onStop={cancelRequest}
                suggestionConfig={{
                  suggestionModels: [...defaultSuggestionModels],
                }}
              />
            </Box>
            <Box className={S.inputActions}>
              {hasError ? (
                <Text c="error" ta="center">
                  {t`Something went wrong. Please try again.`}
                </Text>
              ) : (
                <div />
              )}
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
            {suggestedPrompts?.map(({ prompt: suggestedPrompt }, index) => (
              <UnstyledButton
                key={index}
                className={cx(S.promptSuggestion, {
                  [S.promptSuggestionShow]: !isDoingScience,
                  [S.promptSuggestionHide]: isDoingScience,
                })}
                style={{
                  animationDelay: isDoingScience
                    ? `${(suggestedPromptCount - index - 1) * 50}ms`
                    : `${index * 75}ms`,
                }}
                onClick={() => handleSubmitPrompt(suggestedPrompt)}
                disabled={isDoingScience}
              >
                <Text>{suggestedPrompt}</Text>
              </UnstyledButton>
            ))}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};

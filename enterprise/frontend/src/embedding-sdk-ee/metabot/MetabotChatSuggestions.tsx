import { Button, Stack } from "metabase/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase-enterprise/api";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import S from "./MetabotQuestion.module.css";

export const MetabotChatSuggestions = () => {
  const metabot = useMetabotAgent();

  // Keep in sync with [MetabotChat.tsx]
  const suggestedPromptsQuery = useGetSuggestedMetabotPromptsQuery({
    metabot_id: metabot.metabotId,
    limit: 3,
    sample: true,
  });

  const suggestedPrompts = suggestedPromptsQuery.currentData?.prompts ?? [];

  const shouldShowSuggestedPrompts =
    metabot.messages.length === 0 &&
    metabot.errorMessages.length === 0 &&
    !metabot.isDoingScience &&
    suggestedPrompts.length > 0;

  if (!shouldShowSuggestedPrompts) {
    return null;
  }

  return (
    <Stack gap="sm" p="md" className={S.promptSuggestionsContainer}>
      {suggestedPrompts.map(({ prompt }, index) => (
        <Button
          key={index}
          size="xs"
          variant="outline"
          fw={400}
          onClick={() => metabot.submitInput(prompt, { focusInput: true })}
          className={S.promptSuggestionButton}
          data-testid="metabot-suggestion-button"
        >
          {prompt}
        </Button>
      ))}
    </Stack>
  );
};

import { forwardRef, useImperativeHandle, useRef } from "react";

import { Box, Button, Stack } from "metabase/ui";

import Styles from "./MetabotChat.module.css";

export type MetabotPromptSuggestionsRef = {
  focus: (direction: "up" | "down") => void;
};

type Props = {
  prompts: string[];
  onSubmit: (prompt: string) => void;
  onFocusInput: () => void;
};

export const MetabotPromptSuggestions = forwardRef<
  MetabotPromptSuggestionsRef,
  Props
>(function MetabotPromptSuggestions({ prompts, onSubmit, onFocusInput }, ref) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useImperativeHandle(ref, () => ({
    focus: (direction) => {
      buttons.current[direction === "up" ? prompts.length - 1 : 0]?.focus();
    },
  }));

  return (
    <Stack
      gap="sm"
      className={Styles.promptSuggestionsContainer}
      data-testid="metabot-prompt-suggestions"
    >
      {prompts.map((prompt, index) => (
        <Box key={prompt}>
          <Button
            ref={(button) => {
              buttons.current[index] = button;
            }}
            fz="sm"
            size="sm"
            onClick={() => onSubmit(prompt)}
            onKeyDown={(event) => {
              if (
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onFocusInput();
              } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                const next = index + (event.key === "ArrowUp" ? -1 : 1);
                if (next < 0 || next >= prompts.length) {
                  onFocusInput();
                } else {
                  buttons.current[next]?.focus();
                }
              }
            }}
            className={Styles.promptSuggestionButton}
          >
            {prompt}
          </Button>
        </Box>
      ))}
    </Stack>
  );
});

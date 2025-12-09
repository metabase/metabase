import cx from "classnames";
import { forwardRef } from "react";

import type { MetabotPromptInputRef } from "metabase/metabot";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { Box, Icon, UnstyledButton } from "metabase/ui";

import { MetabotPromptInput } from "../../MetabotPromptInput";

import S from "./MetabotChatEditor.module.css";

interface Props {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  isResponding?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  suggestionModels: SuggestionModel[];
}

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  Props
>(({ isResponding = false, ...props }, ref) => {
  return (
    <Box className={S.editorContainer}>
      <Box className={S.iconContainer}>
        <Icon name="metabot" c="brand" />
      </Box>
      <Box className={S.contentWrapper}>
        <MetabotPromptInput
          {...props}
          ref={ref}
          disabled={isResponding}
          data-testid="metabot-chat-input"
        />
      </Box>
      <UnstyledButton
        className={cx(
          S.button,
          isResponding && S.buttonResponding,
          props.value.length === 0 && !isResponding && S.buttonHidden,
        )}
        onClick={isResponding ? props.onStop : props.onSubmit}
        data-testid={
          isResponding ? "metabot-stop-response" : "metabot-send-message"
        }
      >
        {isResponding ? (
          <Icon className={S.stopIcon} name="stop" />
        ) : (
          <Icon className={S.sendIcon} name="arrow_up" />
        )}
      </UnstyledButton>
    </Box>
  );
});

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";

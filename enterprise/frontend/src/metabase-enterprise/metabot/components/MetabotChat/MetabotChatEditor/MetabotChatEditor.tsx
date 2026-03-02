import cx from "classnames";
import { forwardRef } from "react";

import type { MetabotPromptInputRef } from "metabase/metabot";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import { Box, Icon, UnstyledButton } from "metabase/ui";

import S from "./MetabotChatEditor.module.css";

type MetabotChatEditorProps = Pick<
  MetabotPromptInputProps,
  | "value"
  | "placeholder"
  | "autoFocus"
  | "onChange"
  | "onSubmit"
  | "onStop"
  | "suggestionConfig"
> & { isResponding?: boolean };

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  MetabotChatEditorProps
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

import cx from "classnames";
import { forwardRef } from "react";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotContextUsageRing } from "metabase/metabot/components/MetabotChat/MetabotContextUsageRing";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import { CONTEXT_WINDOW_INDICATOR_PERCENT } from "metabase/metabot/constants";
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
> & {
  isResponding?: boolean;
  disabled?: boolean;
  contextWindowPercentUsage?: number;
};

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  MetabotChatEditorProps
>(
  (
    {
      isResponding = false,
      disabled = false,
      contextWindowPercentUsage = 0,
      ...props
    },
    ref,
  ) => {
    const isPromptEmpty = props.value.length === 0;
    const showContextUsage =
      isPromptEmpty &&
      !isResponding &&
      contextWindowPercentUsage > CONTEXT_WINDOW_INDICATOR_PERCENT;

    return (
      <Box className={S.editorContainer}>
        <Box className={S.contentWrapper}>
          <MetabotPromptInput
            {...props}
            ref={ref}
            disabled={isResponding}
            readOnly={disabled}
            data-testid="metabot-chat-input"
          />
        </Box>
        {showContextUsage ? (
          <MetabotContextUsageRing percentUsage={contextWindowPercentUsage} />
        ) : (
          <UnstyledButton
            className={cx(
              S.button,
              isResponding && S.buttonResponding,
              (isPromptEmpty || disabled) && !isResponding && S.buttonHidden,
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
        )}
      </Box>
    );
  },
);

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";

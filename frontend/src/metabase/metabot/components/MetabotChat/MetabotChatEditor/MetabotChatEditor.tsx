import { forwardRef } from "react";

import type { MetabotPromptInputRef } from "metabase/metabot";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import { MetabotSendButton } from "metabase/metabot/components/MetabotSendButton";
import { Box } from "metabase/ui";

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
      <Box className={S.contentWrapper}>
        <MetabotPromptInput
          {...props}
          ref={ref}
          disabled={isResponding}
          data-testid="metabot-chat-input"
        />
      </Box>
      <MetabotSendButton
        className={S.button}
        isResponding={isResponding}
        isHidden={props.value.length === 0 && !isResponding}
        onClick={isResponding ? props.onStop : props.onSubmit}
      />
    </Box>
  );
});

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";

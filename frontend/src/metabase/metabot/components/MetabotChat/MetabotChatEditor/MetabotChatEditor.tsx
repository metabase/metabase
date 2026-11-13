import { useMergedRef } from "@mantine/hooks";
import { forwardRef, useLayoutEffect, useRef } from "react";

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
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const mergedInputRef = useMergedRef(ref, inputRef);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isButtonHidden = props.value.length === 0 && !isResponding;

  // The hidden button is inert, and the browser would drop its focus to the page body
  useLayoutEffect(() => {
    if (isButtonHidden && buttonRef.current === document.activeElement) {
      inputRef.current?.focus();
    }
  }, [isButtonHidden]);

  return (
    <Box className={S.editorContainer}>
      <Box className={S.contentWrapper}>
        <MetabotPromptInput
          {...props}
          ref={mergedInputRef}
          disabled={isResponding}
          data-testid="metabot-chat-input"
        />
      </Box>
      <MetabotSendButton
        ref={buttonRef}
        className={S.button}
        isResponding={isResponding}
        isHidden={isButtonHidden}
        onClick={isResponding ? props.onStop : props.onSubmit}
      />
    </Box>
  );
});

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";

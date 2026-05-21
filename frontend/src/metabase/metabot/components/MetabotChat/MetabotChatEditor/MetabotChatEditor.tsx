import cx from "classnames";
import { forwardRef } from "react";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotIcon } from "metabase/metabot/components/MetabotIcon";
import { MetabotModelSelector } from "metabase/metabot/components/MetabotModelSelector";
import {
  MetabotPromptInput,
  type MetabotPromptInputProps,
} from "metabase/metabot/components/MetabotPromptInput";
import { Box, Flex, Icon, Stack, UnstyledButton } from "metabase/ui";

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
  modelOverride?: string;
  onModelOverrideChange: (model: string | undefined) => void;
};

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  MetabotChatEditorProps
>(
  (
    { isResponding = false, modelOverride, onModelOverrideChange, ...props },
    ref,
  ) => {
    return (
      <Stack w="100%" gap={0}>
        <Box className={S.contentWrapper}>
          <MetabotPromptInput
            {...props}
            ref={ref}
            disabled={isResponding}
            data-testid="metabot-chat-input"
          />
        </Box>
        <Flex align="center" gap="sm" h="2.5rem">
          <Box className={S.iconContainer} mr="auto">
            <MetabotIcon c="core-brand" />
          </Box>
          <MetabotModelSelector
            disabled={isResponding}
            dropdownPosition="top"
            modelOverride={modelOverride}
            onModelOverrideChange={onModelOverrideChange}
          />
          <UnstyledButton
            className={cx(S.button, isResponding && S.buttonResponding)}
            disabled={props.value.length === 0 && !isResponding}
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
        </Flex>
      </Stack>
    );
  },
);

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";

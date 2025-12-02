import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon } from "metabase/ui";
import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";

import S from "./InlinePromptView.module.css";
import {
  MetabotPromptInput,
  type MetabotPromptInputRef,
} from "./MetabotPromptInput";

export interface InlinePromptViewRef {
  focus: () => void;
  clear: () => void;
  getValue: () => string;
}

interface Props {
  placeholder?: string;
  suggestionModels: SuggestionModel[];
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const InlinePromptView = forwardRef<InlinePromptViewRef, Props>(
  (
    {
      placeholder = t`Describe what SQL you want...`,
      suggestionModels,
      onSubmit,
      onCancel,
    },
    ref,
  ) => {
    const inputRef = useRef<MetabotPromptInputRef>(null);
    const [value, setValue] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => {
        inputRef.current?.clear();
        setValue("");
      },
      getValue: () => inputRef.current?.getValue() ?? "",
    }));

    const handleSubmit = () => {
      const currentValue = inputRef.current?.getValue() ?? "";
      if (currentValue.trim()) {
        setIsSubmitting(true);
        onSubmit(currentValue);
      }
    };

    return (
      <Box className={S.container}>
        <Box className={S.inputWrapper}>
          <MetabotPromptInput
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            autoFocus
            suggestionModels={suggestionModels}
            onChange={setValue}
            onCancel={onCancel}
          />
        </Box>
        <Flex justify="flex-start" gap="xs" className={S.buttonRow}>
          <Button
            size="xs"
            variant="filled"
            onClick={handleSubmit}
            disabled={!value.trim() || isSubmitting}
            loading={isSubmitting}
            leftSection={<Icon name="insight" />}
          >
            {t`Generate`}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t`Cancel`}
          </Button>
        </Flex>
      </Box>
    );
  },
);

// @ts-expect-error - setting displayName on forwardRef component
InlinePromptView.displayName = "InlinePromptView";

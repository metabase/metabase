import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { Box, Button, Flex, Icon } from "metabase/ui";
import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";

import { MetabotPromptInput } from "../MetabotPromptInput";

import S from "./MetabotInlineSQLPrompt.module.css";

interface MetabotInlineSQLPromptPrompts {
  placeholder?: string;
  suggestionModels: readonly SuggestionModel[];
  onSubmit: (value: string) => Promise<void>;
  onCancel: () => void;
}

export const MetabotInlineSQLPrompt = ({
  placeholder = t`Describe what SQL you want...`,
  suggestionModels,
  onSubmit,
  onCancel,
}: MetabotInlineSQLPromptPrompts) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const disabled = !value.trim() || isSubmitting;

  const handleSubmit = useCallback(async () => {
    const currentValue = inputRef.current?.getValue().trim();
    if (currentValue) {
      setIsSubmitting(true);
      setHasError(false);
      try {
        await onSubmit(currentValue);
      } catch {
        setHasError(true);
        setIsSubmitting(false);
      }
    }
  }, [onSubmit]);

  useEffect(() => {
    return tinykeys(
      window,
      {
        "$mod+Enter": (e) => {
          if (!disabled) {
            e.preventDefault();
            handleSubmit();
          }
        },
        "$mod+e": (e) => {
          e.preventDefault();
          onCancel();
        },
      },
      { capture: true },
    );
  }, [disabled, handleSubmit, onCancel]);

  return (
    <Box className={S.container}>
      <Box className={S.inputWrapper}>
        <MetabotPromptInput
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          autoFocus
          disabled={isSubmitting}
          suggestionModels={[...suggestionModels]}
          onChange={setValue}
          onStop={onCancel}
        />
      </Box>
      <Flex
        justify="flex-start"
        align="center"
        gap="xs"
        className={S.buttonRow}
      >
        <Button
          size="xs"
          px="sm"
          variant="filled"
          onClick={handleSubmit}
          disabled={disabled}
          leftSection={
            isSubmitting ? <Icon name="hourglass" /> : <Icon name="insight" />
          }
        >
          {isSubmitting ? t`Generating` : t`Generate`}
        </Button>
        <Button size="xs" variant="subtle" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        {hasError && (
          <Box
            className={S.errorMessage}
          >{t`Something went wrong. Please try again.`}</Box>
        )}
      </Flex>
    </Box>
  );
};

import type * as React from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Button from "metabase/core/components/Button";
import { Icon } from "metabase/ui";
import type { FieldType, FieldValueOptions } from "metabase-types/api";

import {
  OptionEditorContainer,
  AddMorePrompt,
  ErrorMessage,
  TextArea,
} from "./OptionEditor.styled";

const optionsToText = (options: FieldValueOptions) => options.join("\n");
export const textToOptions = (text: string): FieldValueOptions => {
  const options = text
    .trim()
    .split("\n")
    .map(option => option.trim())
    .filter(Boolean);
  const uniqueOptions = [...new Set(options)];

  return uniqueOptions;
};

function transformOptionsIfNeeded(
  options: FieldValueOptions,
  fieldType: FieldType,
) {
  if (fieldType === "number") {
    return options.map(option => Number(option));
  }

  return options;
}

function getValidationError(options: FieldValueOptions, fieldType: FieldType) {
  if (fieldType !== "number") {
    return;
  }

  const isValid = options.every(option => !Number.isNaN(option));

  return isValid ? undefined : t`Invalid number format`;
}

export interface OptionEditorProps {
  fieldType: FieldType;
  options: FieldValueOptions;
  onChange: (options: FieldValueOptions) => void;
}

export const OptionPopover = ({
  fieldType,
  options,
  onChange,
}: OptionEditorProps) => {
  const [text, setText] = useState(optionsToText(options));
  const [error, setError] = useState<string | null>(null);

  const hasOptions = text.length > 0;
  const isDirty = text !== optionsToText(options);
  const hasError = Boolean(error);
  const canSave = hasOptions && isDirty && !hasError;

  useEffect(() => {
    if (optionsToText(options) !== text) {
      setText(optionsToText(options));
    }
    // Ignore text changes caused by user edits,
    // and only trigger when options change from outside
    // (e.g. on field type change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (hasError) {
      setError(null);
    }
  };

  const handleSave = (closePopover: () => void) => {
    setError(null);

    const nextOptions = transformOptionsIfNeeded(
      textToOptions(text),
      fieldType,
    );
    const error = getValidationError(nextOptions, fieldType);

    if (error) {
      setError(error);
    } else {
      onChange(nextOptions);
      closePopover();
    }
  };

  return (
    <TippyPopoverWithTrigger
      placement="bottom-end"
      triggerContent={
        <Icon name="list" size={20} tooltip={t`Change options`} />
      }
      maxWidth={400}
      popoverContent={({ closePopover }) => (
        <OptionEditorContainer>
          <TextArea
            value={text}
            onChange={handleTextChange}
            placeholder={t`Enter one option per line`}
          />
          <AddMorePrompt isVisible={hasOptions}>
            {t`Press enter to add another option`}
          </AddMorePrompt>
          {hasError && <ErrorMessage>{error}</ErrorMessage>}
          <Button
            disabled={!canSave}
            onClick={() => handleSave(closePopover)}
            small
          >
            {t`Save`}
          </Button>
        </OptionEditorContainer>
      )}
    />
  );
};

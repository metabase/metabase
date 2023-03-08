import React, { useState } from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";

import type { FieldType } from "metabase-types/api";

import {
  OptionEditorContainer,
  AddMorePrompt,
  ErrorMessage,
  TextArea,
} from "./OptionEditor.styled";

export type ValueOptions = (string | number)[];

const optionsToText = (options: ValueOptions) => options.join("\n");
const textToOptions = (text: string): ValueOptions =>
  text.split("\n").map(option => option.trim());

function cleanOptions(options: ValueOptions, fieldType: FieldType) {
  if (fieldType === "number") {
    return options.map(option => Number(option));
  }
  return options;
}

function getValidationError(options: ValueOptions, fieldType: FieldType) {
  if (fieldType === "number") {
    const isValid = options.every(option => !Number.isNaN(option));
    return isValid ? undefined : t`Invalid number format`;
  }
  return;
}

export interface OptionEditorProps {
  fieldType: FieldType;
  options: ValueOptions;
  onChange: (options: ValueOptions) => void;
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

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (hasError) {
      setError(null);
    }
  };

  const handleSave = (closePopover: () => void) => {
    setError(null);
    const nextOptions = cleanOptions(textToOptions(text), fieldType);
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

import React, { ChangeEvent, FocusEvent, forwardRef, Ref } from "react";
import { t } from "ttag";
import { InputButton, InputField, InputRoot } from "./FileInput.styled";

export interface FileInputProps {
  className?: string;
  name?: string;
  autoFocus?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const FileInput = forwardRef(function FileInput(
  { className, name, autoFocus, onChange, onFocus, onBlur }: FileInputProps,
  ref: Ref<HTMLLabelElement>,
): JSX.Element {
  return (
    <InputRoot innerRef={ref as any} className={className}>
      <InputField
        type="file"
        name={name}
        autoFocus={autoFocus}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <InputButton>{t`Select a file`}</InputButton>
    </InputRoot>
  );
});

export default FileInput;

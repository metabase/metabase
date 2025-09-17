import type { ChangeEvent, FocusEvent, HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback, useState } from "react";
import { t } from "ttag";

import { InputButton, InputField, InputRoot } from "./FileInput.styled";

export type FileInputAttributes = Omit<
  HTMLAttributes<HTMLLabelElement>,
  "onChange" | "onFocus" | "onBlur"
>;

export interface FileInputProps extends FileInputAttributes {
  className?: string;
  name?: string;
  autoFocus?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const FileInput = forwardRef(function FileInput(
  { name, autoFocus, onChange, onFocus, onBlur, ...props }: FileInputProps,
  ref: Ref<HTMLLabelElement>,
): JSX.Element {
  const [hasValue, setHasValue] = useState(false);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      setHasValue(files != null && files?.length > 0);
      onChange && onChange(event);
    },
    [onChange],
  );

  return (
    <InputRoot ref={ref} {...props}>
      <InputField
        type="file"
        name={name}
        hasValue={hasValue}
        autoFocus={autoFocus}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <InputButton>{t`Select a file`}</InputButton>
    </InputRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FileInput;

import cx from "classnames";
import type { ChangeEvent, FocusEvent, HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Text } from "metabase/ui";

import S from "./FileInput.module.css";

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

export const FileInput = forwardRef(function FileInput(
  {
    name,
    autoFocus,
    className,
    onChange,
    onFocus,
    onBlur,
    ...props
  }: FileInputProps,
  ref: Ref<HTMLLabelElement>,
): JSX.Element {
  const [hasValue, setHasValue] = useState(false);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      setHasValue(files != null && files?.length > 0);
      onChange?.(event);
    },
    [onChange],
  );

  return (
    <label ref={ref} {...props} className={cx(CS.flex, className)}>
      <Box
        component="input"
        type="file"
        className={S.input}
        name={name}
        c="text-primary"
        flex="1 1 auto"
        ff="inherit"
        fw={hasValue ? "bold" : undefined}
        autoFocus={autoFocus}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <Text
        component="span"
        className={cx(S.border, S.button, CS.cursorPointer, CS.textNoWrap)}
        fw="bold"
        lh="md"
        px="md"
        py="sm"
      >{t`Select a file`}</Text>
    </label>
  );
});

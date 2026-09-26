import type { Ref } from "react";
import { forwardRef } from "react";

import type { TextInputProps } from "metabase/ui";
import { TextInput } from "metabase/ui";

import type { CopyTextFieldClassNames } from "../CopyTextField/copy-text-field-props";
import { getCopyTextFieldProps } from "../CopyTextField/copy-text-field-props";

export type CopyTextInputProps = Omit<TextInputProps, "classNames"> & {
  value: string;
  onCopied?: () => void;
  classNames?: CopyTextFieldClassNames<TextInputProps>;
};

export const CopyTextInput = forwardRef(function CopyTextInput(
  { classNames, onClick, onCopied, readOnly, ...props }: CopyTextInputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <TextInput
      {...props}
      ref={ref}
      {...getCopyTextFieldProps<HTMLInputElement>({
        value: props.value,
        readOnly,
        onClick,
        onCopied,
      })}
      classNames={classNames}
    />
  );
});

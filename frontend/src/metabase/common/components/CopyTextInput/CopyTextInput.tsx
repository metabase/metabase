import cx from "classnames";
import type { Ref } from "react";
import { forwardRef } from "react";

import type { TextInputProps } from "metabase/ui";
import { TextInput } from "metabase/ui";

import { getCopyTextFieldProps } from "../CopyTextField/copy-text-field-props";

import S from "./CopyTextInput.module.css";

export const CopyTextInput = forwardRef(function CopyTextInput(
  {
    classNames,
    onClick,
    onCopied,
    readOnly,
    ...props
  }: TextInputProps & { value: string; onCopied?: () => void },
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
      classNames={{
        ...classNames,
        // Unjustified type cast. FIXME
        input: cx(S.input, (classNames as Record<string, string>)?.input),
      }}
    />
  );
});

import cx from "classnames";
import type { Ref } from "react";
import { forwardRef } from "react";

import type { TextareaProps } from "metabase/ui";
import { Textarea } from "metabase/ui";

import { getCopyTextFieldProps } from "../CopyTextField/copy-text-field-props";

import S from "./CopyTextArea.module.css";

/**
 * The multi-line sibling of `CopyTextInput`: a read-only `Textarea` with the same
 * copy button. Long single-line values soft-wrap for readability while the copied
 * value stays exactly what was passed.
 */
export const CopyTextArea = forwardRef(function CopyTextArea(
  {
    classNames,
    onClick,
    onCopied,
    readOnly,
    ...props
  }: TextareaProps & { value: string; onCopied?: () => void },
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <Textarea
      {...props}
      ref={ref}
      {...getCopyTextFieldProps<HTMLTextAreaElement>({
        value: props.value,
        readOnly,
        onClick,
        onCopied,
      })}
      classNames={{
        ...classNames,
        input: cx(S.input, (classNames as Record<string, string>)?.input),
        section: cx(S.section, (classNames as Record<string, string>)?.section),
      }}
    />
  );
});

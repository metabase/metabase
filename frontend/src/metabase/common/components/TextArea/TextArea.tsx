import type { Ref, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

import { TextAreaRoot } from "./TextArea.styled";

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  fullWidth?: boolean;
}

const TextAreaInner = forwardRef(function TextArea(
  { error, fullWidth, ...props }: TextAreaProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <TextAreaRoot {...props} ref={ref} hasError={error} fullWidth={fullWidth} />
  );
});

export const TextArea = Object.assign(TextAreaInner, {
  Root: TextAreaRoot,
});

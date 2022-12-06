import React, { forwardRef, Ref, TextareaHTMLAttributes } from "react";
import { TextAreaRoot } from "./TextArea.styled";

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  fullWidth?: boolean;
}

const TextArea = forwardRef(function TextArea(
  { error, fullWidth, ...props }: TextAreaProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <TextAreaRoot {...props} ref={ref} hasError={error} fullWidth={fullWidth} />
  );
});

export default Object.assign(TextArea, {
  Root: TextAreaRoot,
});

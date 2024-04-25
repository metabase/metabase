import type { Ref, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(TextArea, {
  Root: TextAreaRoot,
});

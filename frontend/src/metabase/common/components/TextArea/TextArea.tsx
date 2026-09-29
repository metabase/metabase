import cx from "classnames";
import type { Ref, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

import S from "./TextArea.module.css";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  fullWidth?: boolean;
}

export const TextArea = forwardRef(function TextArea(
  { error, fullWidth, readOnly, className, ...props }: TextAreaProps,
  ref: Ref<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      ref={ref}
      readOnly={readOnly}
      className={cx(
        S.root,
        {
          [S.readOnly]: readOnly,
          [S.error]: error,
          [S.fullWidth]: fullWidth,
        },
        className,
      )}
    />
  );
});

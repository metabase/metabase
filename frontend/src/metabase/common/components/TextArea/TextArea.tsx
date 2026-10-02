import cx from "classnames";
import type { Ref, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

import { Box } from "metabase/ui";

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
    <Box
      component="textarea"
      {...props}
      ref={ref}
      readOnly={readOnly}
      className={cx(S.root, { [S.error]: error }, className)}
      w={fullWidth ? "100%" : undefined}
      p="md"
      bdrs="sm"
      bg={readOnly ? "background_page-secondary" : "background_page-primary"}
      c="text-primary"
      ff="inherit"
      fz="1rem"
      fw={700}
      ta="inherit"
    />
  );
});

import {
  type InputVariant,
  Textarea as MantineTextarea,
  type TextareaProps as MantineTextareaProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type TextareaProps = Omit<MantineTextareaProps, "size" | "variant"> & {
  size?: "sm" | "md" | "lg";
  variant?: InputVariant | "read-only";
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(props, ref) {
    return <MantineTextarea {...props} ref={ref} />;
  },
);

export { textareaOverrides } from "./Textarea.config";

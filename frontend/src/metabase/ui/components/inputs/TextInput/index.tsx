import {
  type InputVariant,
  TextInput as MantineTextInput,
  type TextInputProps as MantineTextInputProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type TextInputProps = Omit<MantineTextInputProps, "size" | "variant"> & {
  size?: "sm" | "md" | "lg";
  variant?: InputVariant | "read-only";
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(props, ref) {
    return <MantineTextInput {...props} ref={ref} />;
  },
);

export { textInputOverrides } from "./TextInput.config";

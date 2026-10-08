import {
  TextInput as MantineTextInput,
  type TextInputProps as MantineTextInputProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type TextInputProps = Omit<MantineTextInputProps, "size"> & {
  size?: "sm" | "md" | "lg";
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(props, ref) {
    return <MantineTextInput {...props} ref={ref} />;
  },
);

export { textInputOverrides } from "./TextInput.config";

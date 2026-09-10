import {
  PasswordInput as MantinePasswordInput,
  type PasswordInputProps as MantinePasswordInputProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type PasswordInputProps = Omit<MantinePasswordInputProps, "size"> & {
  size?: "sm" | "md" | "lg";
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    return <MantinePasswordInput {...props} ref={ref} />;
  },
);

export { passwordInputOverrides } from "./PasswordInput.config";

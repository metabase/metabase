import {
  type InputVariant,
  PasswordInput as MantinePasswordInput,
  type PasswordInputProps as MantinePasswordInputProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type PasswordInputProps = Omit<
  MantinePasswordInputProps,
  "size" | "variant"
> & {
  size?: "sm" | "md" | "lg";
  variant?: InputVariant | "read-only";
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    return <MantinePasswordInput {...props} ref={ref} />;
  },
);

export { passwordInputOverrides } from "./PasswordInput.config";

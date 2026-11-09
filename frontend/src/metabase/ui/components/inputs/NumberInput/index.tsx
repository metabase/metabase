import {
  NumberInput as MantineNumberInput,
  type NumberInputProps as MantineNumberInputProps,
} from "@mantine/core";
import { forwardRef } from "react";

export type NumberInputProps = Omit<MantineNumberInputProps, "size"> & {
  size?: "sm" | "md" | "lg";
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ disabled, hideControls, ...props }, ref) {
    return (
      <MantineNumberInput
        {...props}
        disabled={disabled}
        hideControls={disabled ? true : hideControls}
        ref={ref}
      />
    );
  },
);

export { numberInputOverrides } from "./NumberInput.config";

import {
  Button as MantineButton,
  type ButtonProps as MantineButtonProps,
  createPolymorphicComponent,
} from "@mantine/core";
import type { HTMLAttributes } from "react";

export type { ButtonGroupProps } from "@mantine/core";
export { buttonOverrides } from "./Button.config";

export type ButtonSize = "sm" | "md" | "lg" | "compact-sm" | "compact-md";

export type ButtonProps = Omit<MantineButtonProps, "size"> & {
  size?: ButtonSize;
  animate?: boolean;
  highlightOnHover?: boolean;
  type?: "button" | "submit" | "reset";
} & HTMLAttributes<HTMLButtonElement>;

export const Button = createPolymorphicComponent<
  "button",
  ButtonProps,
  { Group: typeof MantineButton.Group }
>(MantineButton);

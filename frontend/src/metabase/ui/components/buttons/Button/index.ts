import type { ButtonProps as MantineButtonProps } from "@mantine/core";
import type { HTMLAttributes } from "react";

export { Button } from "@mantine/core";
export type { ButtonGroupProps } from "@mantine/core";
export { buttonOverrides } from "./Button.config";

export type ButtonProps = MantineButtonProps & {
  animate?: boolean;
  highlightOnHover?: boolean;
  type?: "button" | "submit";
} & HTMLAttributes<HTMLButtonElement>;

import type { ButtonProps as MantineButtonProps } from "@mantine/core";
import type { HTMLAttributes } from "react";

export { Button } from "@mantine/core";
export type { ButtonGroupProps } from "@mantine/core";
export { buttonOverrides } from "./Button.config";

export type ExtraButtonProps = {
  animate?: boolean;
  highlightOnHover?: boolean;
  type?: "button" | "submit";
};
export type ButtonProps = MantineButtonProps &
  ExtraButtonProps &
  HTMLAttributes<HTMLButtonElement>;

import type { ButtonProps as MantineButtonProps } from "@mantine/core";
import type { ButtonHTMLAttributes } from "react";

export type ButtonSize = "sm" | "md" | "lg" | "compact-sm" | "compact-md";

export type ButtonVariant =
  | "default"
  | "filled"
  | "light"
  | "subtle"
  | "transparent"
  | "on-dark-primary"
  | "on-dark-secondary";

export type ButtonColor =
  | "brand"
  | "filter"
  | "negative"
  | "positive"
  | "warning"
  | "neutral";

export type ButtonProps = Omit<
  MantineButtonProps,
  "size" | "variant" | "color"
> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
  color?: ButtonColor;
} & ButtonHTMLAttributes<HTMLButtonElement>;

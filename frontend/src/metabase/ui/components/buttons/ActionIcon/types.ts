import type { ActionIconProps as MantineActionIconProps } from "@mantine/core";
import type { ButtonHTMLAttributes } from "react";

/**
 * @inline
 */
export type ActionIconSize = "xs" | "sm" | "md" | "lg";

/**
 * @inline
 */
export type ActionIconVariant =
  | "default"
  | "filled"
  | "light"
  | "subtle"
  | "on-dark-primary"
  | "on-dark-secondary";

/**
 * @inline
 */
export type ActionIconColor =
  | "brand"
  | "negative"
  | "positive"
  | "warning"
  | "neutral";

/**
 * @inline
 */
export type ActionIconProps = Omit<
  MantineActionIconProps,
  "size" | "variant" | "color"
> & {
  size?: ActionIconSize;
  variant?: ActionIconVariant;
  color?: ActionIconColor;
  selected?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

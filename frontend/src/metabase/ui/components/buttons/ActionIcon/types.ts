import type { ActionIconProps as MantineActionIconProps } from "@mantine/core";

/**
 * @inline
 */
export type ActionIconColor = "neutral" | "brand" | "negative" | "positive";

export type ActionIconProps = Omit<MantineActionIconProps, "color"> & {
  color?: ActionIconColor;
};

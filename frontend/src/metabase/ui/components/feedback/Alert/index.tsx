import {
  Alert as MantineAlert,
  type AlertProps as MantineAlertProps,
} from "@mantine/core";

import type { AlertColor } from "./Alert.config";

export { alertOverrides } from "./Alert.config";

export type AlertProps = Omit<MantineAlertProps, "color"> & {
  color?: AlertColor;
  size?: "default" | "compact";
};

export const Alert = ({ size = "default", color, ...props }: AlertProps) => (
  <MantineAlert
    data-size={size}
    data-color={color ?? "default"}
    // `AlertColor` holds variant names, not color tokens, so it does not fit
    // Mantine's color type; Alert.config.tsx resolves them to real tokens.
    color={color as MantineAlertProps["color"]}
    {...props}
  />
);

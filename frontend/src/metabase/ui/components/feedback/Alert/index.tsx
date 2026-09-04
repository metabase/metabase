import {
  Alert as MantineAlert,
  type AlertProps as MantineAlertProps,
} from "@mantine/core";

import type { AlertColor } from "./Alert.config";

export { alertOverrides } from "./Alert.config";

export type AlertProps = MantineAlertProps & {
  color?: AlertColor;
  size?: "default" | "compact";
};

export const Alert = ({ size = "default", ...props }: AlertProps) => (
  <MantineAlert
    data-size={size}
    data-color={props.color ?? "default"}
    {...props}
  />
);

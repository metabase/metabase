import {
  Alert as MantineAlert,
  type AlertProps as MantineAlertProps,
} from "@mantine/core";

import { type AlertColor, getAlertColorVars } from "./Alert.config";

export { alertOverrides } from "./Alert.config";

export type AlertProps = Omit<MantineAlertProps, "color"> & {
  color?: AlertColor;
  size?: "default" | "compact";
};

export const Alert = ({ size = "default", color, ...props }: AlertProps) => (
  <MantineAlert
    data-size={size}
    data-color={color ?? "default"}
    vars={() => ({ root: getAlertColorVars(props.variant, color) })}
    {...props}
  />
);

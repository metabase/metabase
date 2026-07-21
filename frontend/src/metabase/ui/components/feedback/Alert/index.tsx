import {
  Alert as MantineAlert,
  type AlertProps as MantineAlertProps,
} from "@mantine/core";
export { alertOverrides } from "./Alert.config";

export type AlertProps = MantineAlertProps & {
  color?: "core-brand" | "warning" | "error" | "info" | "success";
  size?: "default" | "compact";
};

export const Alert = ({ size = "default", ...props }: AlertProps) => (
  <MantineAlert data-size={size} {...props} />
);

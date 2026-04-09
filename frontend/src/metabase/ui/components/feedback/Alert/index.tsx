import {
  Alert as MantineAlert,
  type AlertProps as MantineAlertProps,
} from "@mantine/core";
export { alertOverrides } from "./Alert.config";

export type AlertProps = MantineAlertProps & {
  color?: "brand" | "warning" | "error" | "info" | "success";
};

export const Alert = (props: AlertProps) => <MantineAlert {...props} />;

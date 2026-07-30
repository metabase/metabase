import { Alert, type MantineThemeOverride } from "@mantine/core";

import type { ColorName } from "metabase/ui/colors/types";
import { color } from "metabase/ui/utils/colors";

import AlertStyles from "./Alert.module.css";

export type AlertColor =
  | "core-brand"
  | "warning"
  | "error"
  | "success"
  | "default";
export type AlertVariant = "default" | "light";

type AlertColorConfig = {
  icon: ColorName;
  background: ColorName;
  border: ColorName;
  title: ColorName;
};

const COLOR_SETS: Record<AlertColor, AlertColorConfig> = {
  default: {
    icon: "icon-brand",
    background: "background_surface-primary",
    border: "border",
    title: "text-primary",
  },
  "core-brand": {
    icon: "text-brand-strong",
    background: "background_surface-brand-subtle",
    border: "core-brand",
    title: "text-brand-strong",
  },
  warning: {
    icon: "feedback-warning-strong",
    background: "background_surface-warning",
    border: "feedback-warning-strong",
    title: "feedback-warning-strong",
  },
  error: {
    icon: "feedback-negative-strong",
    background: "background_surface-error-subtle",
    border: "feedback-negative-strong",
    title: "feedback-negative-strong",
  },
  success: {
    icon: "feedback-positive-strong",
    background: "background_surface-success",
    border: "feedback-positive-strong",
    title: "feedback-positive-strong",
  },
};

const ALERT_COLORS_BY_VARIANT: Record<AlertVariant, typeof COLOR_SETS> = {
  default: COLOR_SETS,
  light: {
    ...COLOR_SETS,
    default: {
      ...COLOR_SETS.default,
      background: "background_surface-secondary",
    },
  },
};

const isAlertColor = (value?: string): value is AlertColor =>
  value !== undefined && value in COLOR_SETS;

const isAlertVariant = (value?: string): value is AlertVariant =>
  value !== undefined && value in ALERT_COLORS_BY_VARIANT;

export const alertOverrides: MantineThemeOverride["components"] = {
  Alert: Alert.extend({
    defaultProps: {
      variant: "default",
    },
    classNames: {
      root: AlertStyles.root,
      wrapper: AlertStyles.wrapper,
      icon: AlertStyles.icon,
      body: AlertStyles.body,
      title: AlertStyles.title,
      message: AlertStyles.message,
      closeButton: AlertStyles.closeButton,
    },
    vars: (_theme, props) => {
      const variant = isAlertVariant(props.variant) ? props.variant : "default";
      const variantColors = ALERT_COLORS_BY_VARIANT[variant];
      const colorName = isAlertColor(props.color) ? props.color : "default";
      const colors = variantColors[colorName];
      return {
        root: {
          "--alert-color": color(colors.icon),
          "--alert-bg": color(colors.background),
          "--alert-border-color": color(colors.border),
          "--alert-title-color": color(colors.title),
        },
      };
    },
  }),
};

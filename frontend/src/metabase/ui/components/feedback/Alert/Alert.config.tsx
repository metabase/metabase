import { Alert, type MantineThemeOverride } from "@mantine/core";

import type { ColorName } from "metabase/ui/colors/types";
import { color, isColorName } from "metabase/ui/utils/colors";

import AlertStyles from "./Alert.module.css";

const ALERT_BACKGROUND_COLORS: Record<string, ColorName> = {
  "core-brand": "background_surface-brand-subtle",
  warning: "background_surface-warning",
  error: "background_surface-error-subtle",
  info: "background_page-tertiary",
  success: "background_surface-success",
};

const ALERT_ICON_COLORS: Record<string, ColorName> = {
  "core-brand": "text-brand-strong",
  warning: "feedback-warning-strong",
  error: "feedback-negative-strong",
  info: "text-brand",
  success: "feedback-positive-strong",
};

const ALERT_BORDER_COLORS: Record<string, ColorName> = {
  "core-brand": "core-brand",
  success: "feedback-positive-strong",
  error: "feedback-negative-strong",
  warning: "feedback-warning-strong",
};

const ALERT_TITLE_COLORS: Record<string, ColorName> = {
  "core-brand": "text-brand-strong",
  success: "feedback-positive-strong",
  error: "feedback-negative-strong",
  warning: "feedback-warning-strong",
};

const NEUTRAL_BACKGROUND: Record<string, ColorName> = {
  light: "background_surface-secondary",
  default: "background-primary",
};

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
      const variant = props.variant === "light" ? "light" : "default";
      const iconColor = props.color
        ? ALERT_ICON_COLORS[props.color]
        : undefined;
      const bgColor = props.color
        ? ALERT_BACKGROUND_COLORS[props.color]
        : undefined;
      const borderColor = props.color
        ? ALERT_BORDER_COLORS[props.color]
        : undefined;
      const titleColor = props.color
        ? ALERT_TITLE_COLORS[props.color]
        : undefined;
      if (isColorName(iconColor) && isColorName(bgColor)) {
        return {
          root: {
            "--alert-color": color(iconColor),
            "--alert-bg": color(bgColor),
            ...(isColorName(borderColor)
              ? { "--alert-border-color": color(borderColor) }
              : {}),
            ...(isColorName(titleColor)
              ? { "--alert-title-color": color(titleColor) }
              : {}),
          },
        };
      }
      if (variant === "light") {
        return {
          root: {
            "--alert-color": color("icon-brand"),
            "--alert-bg": color(NEUTRAL_BACKGROUND[variant]),
          },
        };
      }
      return {
        root: {
          "--alert-color": color("icon-brand"),
          "--alert-bg": color("background_surface-primary"),
        },
      };
    },
  }),
};

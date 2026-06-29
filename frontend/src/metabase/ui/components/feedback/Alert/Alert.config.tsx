import { Alert, type MantineThemeOverride } from "@mantine/core";

import type { ColorName } from "metabase/ui/colors/types";
import { color, isColorName } from "metabase/ui/utils/colors";

import AlertStyles from "./Alert.module.css";

const ALERT_BACKGROUND_COLORS: Record<string, ColorName> = {
  "core-brand": "background_surface-brand-subtle",
  warning: "background_surface-warning",
  error: "background_surface-error",
  info: "background_page-tertiary",
  success: "background_surface-success",
};

export const alertOverrides: MantineThemeOverride["components"] = {
  Alert: Alert.extend({
    defaultProps: {
      variant: "outline",
    },
    classNames: {
      wrapper: AlertStyles.wrapper,
      title: AlertStyles.title,
    },
    vars: (_theme, props) => {
      const bgColor = props.color
        ? ALERT_BACKGROUND_COLORS[props.color]
        : undefined;
      if (isColorName(props.color) && isColorName(bgColor)) {
        return {
          root: {
            "--alert-color": color(props.color),
            "--alert-bg": color(bgColor),
          },
        };
      } else {
        return {
          root: {},
        };
      }
    },
  }),
};

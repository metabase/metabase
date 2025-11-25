import { Alert, type MantineThemeOverride } from "@mantine/core";

import { color, isColorName } from "metabase/ui/utils/colors";

import AlertStyles from "./Alert.module.css";

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
      if (
        isColorName(props.color) &&
        isColorName(`background-${props.color}`)
      ) {
        return {
          root: {
            "--alert-color": color(props.color),
            "--alert-bg": color(`background-${props.color}`),
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

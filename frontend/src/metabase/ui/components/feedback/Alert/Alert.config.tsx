import { Alert, type MantineThemeOverride } from "@mantine/core";

import AlertStyles from "./Alert.module.css";

export const alertOverrides: MantineThemeOverride["components"] = {
  Alert: Alert.extend({
    defaultProps: {
      variant: "outline",
    },
    classNames: {
      root: AlertStyles.root,
      wrapper: AlertStyles.wrapper,
    },
  }),
};

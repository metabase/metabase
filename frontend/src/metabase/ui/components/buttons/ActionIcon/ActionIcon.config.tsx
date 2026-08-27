import { ActionIcon, type MantineThemeOverride } from "@mantine/core";

import ActionIconStyles from "./ActionIcon.module.css";

export const actionIconOverrides: MantineThemeOverride["components"] = {
  ActionIcon: ActionIcon.extend({
    defaultProps: {
      variant: "subtle",
      loaderProps: {
        color: "currentColor",
      },
    },
    classNames: {
      root: ActionIconStyles.root,
    },
  }),
};

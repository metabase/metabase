import type { ActionIconFactory, MantineThemeOverride } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import ActionIconStyles from "./ActionIcon.module.css";

export const actionIconOverrides: MantineThemeOverride["components"] = {
  ActionIcon: themeComponent<ActionIconFactory>({
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

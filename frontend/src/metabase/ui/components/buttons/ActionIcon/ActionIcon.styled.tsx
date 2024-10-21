import { ActionIcon, type MantineThemeOverride } from "@mantine/core";

import ActionIconStyles from "./ActionIcon.module.css";

export const actionIconOverrides: MantineThemeOverride["components"] = {
  ActionIcon: ActionIcon.extend({
    classNames: {
      root: ActionIconStyles.root,
    },
  }),
};

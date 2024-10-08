import type { MantineThemeOverride } from "@mantine/core";

import DividerStyles from "./Divider.module.css";

export const dividerOverrides: MantineThemeOverride["components"] = {
  Divider: {
    classNames: {
      root: DividerStyles.root,
      label: DividerStyles.label,
    },
  },
};

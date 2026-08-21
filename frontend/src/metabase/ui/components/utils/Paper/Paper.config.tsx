import { type MantineThemeOverride, Paper } from "@mantine/core";

import PaperStyles from "./Paper.module.css";

export const paperOverrides: MantineThemeOverride["components"] = {
  Paper: Paper.extend({
    defaultProps: {
      radius: "sm",
      shadow: "sm",
    },
    classNames: {
      root: PaperStyles.root,
    },
  }),
};

import { type MantineThemeOverride, Paper } from "@mantine/core";

import PaperStyles from "./Paper.module.css";

export const paperOverrides: MantineThemeOverride["components"] = {
  Paper: Paper.extend({
    defaultProps: {
      radius: "xxs",
      shadow: "xs_outline",
    },
    classNames: {
      root: PaperStyles.root,
    },
  }),
};

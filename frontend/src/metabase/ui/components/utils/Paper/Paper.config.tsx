import type { MantineThemeOverride, PaperFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import PaperStyles from "./Paper.module.css";

export const paperOverrides: MantineThemeOverride["components"] = {
  Paper: themeComponent<PaperFactory>({
    defaultProps: {
      radius: "md",
      shadow: "md",
    },
    classNames: {
      root: PaperStyles.root,
    },
  }),
};

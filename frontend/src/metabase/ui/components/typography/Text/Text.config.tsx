import type { MantineThemeOverride, TextFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import TextStyles from "./Text.module.css";

export const textOverrides: MantineThemeOverride["components"] = {
  Text: themeComponent<TextFactory>({
    defaultProps: {
      color: "text-primary",
      size: "md",
      component: "div",
    },
    classNames: {
      root: TextStyles.root,
    },
  }),
};

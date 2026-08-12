import type { MantineThemeOverride, ScrollAreaFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import ScrollAreaStyles from "./ScrollArea.module.css";

export const scrollAreaOverrides: MantineThemeOverride["components"] = {
  ScrollArea: themeComponent<ScrollAreaFactory>({
    classNames: {
      root: ScrollAreaStyles.root,
    },
  }),
};

import { type MantineThemeOverride, ScrollArea } from "@mantine/core";

import ScrollAreaStyles from "./ScrollArea.module.css";

export const scrollAreaOverrides: MantineThemeOverride["components"] = {
  ScrollArea: ScrollArea.extend({
    classNames: {
      root: ScrollAreaStyles.root,
    },
  }),
};

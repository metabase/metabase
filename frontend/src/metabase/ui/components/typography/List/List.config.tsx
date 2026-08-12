import type { ListFactory, MantineThemeOverride } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import ListStyles from "./List.module.css";

export const listOverrides: MantineThemeOverride["components"] = {
  List: themeComponent<ListFactory>({
    classNames: {
      root: ListStyles.root,
      item: ListStyles.item,
    },
  }),
};

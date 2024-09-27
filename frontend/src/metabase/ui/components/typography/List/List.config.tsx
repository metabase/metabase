import { List, type MantineThemeOverride } from "@mantine/core";

import ListStyles from "./List.module.css";

export const listOverrides: MantineThemeOverride["components"] = {
  List: List.extend({
    classNames: {
      root: ListStyles.root,
      item: ListStyles.item,
    },
  }),
};

import type { MantineThemeOverride, TabsFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import TabStyles from "./Tab.module.css";

export const tabsOverrides: MantineThemeOverride["components"] = {
  Tabs: themeComponent<TabsFactory>({
    defaultProps: {
      keepMounted: false,
    },
    classNames: {
      tab: TabStyles.tab,
      list: TabStyles.list,
      tabSection: TabStyles.tabSection,
      tabLabel: TabStyles.tabLabel,
    },
  }),
};

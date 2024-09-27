import { type MantineThemeOverride, Tabs } from "@mantine/core";

import TabStyles from "./Tab.module.css";

export const tabsOverrides: MantineThemeOverride["components"] = {
  Tabs: Tabs.extend({
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

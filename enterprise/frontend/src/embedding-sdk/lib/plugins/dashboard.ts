import { merge } from "icepick";

import type {
  MetabaseDashboardCardMenuPluginsConfig,
  MetabasePluginsConfig,
} from "embedding-sdk";

const DEFAULT_DASHCARD_MENU_ITEMS: MetabaseDashboardCardMenuPluginsConfig = {
  dashcardMenu: {
    withDownloads: true,
    withEditLink: true,
    customItems: [],
  },
} as const;

const getDashcardMenu = (plugins: MetabasePluginsConfig) => {
  if (typeof plugins?.dashboardCardMenu?.dashcardMenu === "function") {
    return plugins?.dashboardCardMenu?.dashcardMenu;
  }
  return merge(
    DEFAULT_DASHCARD_MENU_ITEMS,
    plugins?.dashboardCardMenu?.dashcardMenu,
  );
};

export const addDefaultDashboardPluginValues = (
  plugins: MetabasePluginsConfig = {},
): MetabasePluginsConfig => {
  return {
    ...plugins,
    dashboardCardMenu: {
      dashcardMenu: getDashcardMenu(plugins),
    },
  };
};

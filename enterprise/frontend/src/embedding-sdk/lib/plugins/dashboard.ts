import { merge } from "icepick";

import type {
  MetabaseDashboardPluginsConfig,
  MetabasePluginsConfig,
} from "embedding-sdk";

const DEFAULT_DASHCARD_MENU_ITEMS: MetabaseDashboardPluginsConfig = {
  dashboardCardMenu: {
    withDownloads: true,
    withEditLink: true,
    customItems: [],
  },
} as const;

const getDashcardMenu = (plugins: MetabasePluginsConfig) => {
  if (typeof plugins?.dashboard?.dashboardCardMenu === "function") {
    return plugins?.dashboard?.dashboardCardMenu;
  }
  return merge(
    DEFAULT_DASHCARD_MENU_ITEMS,
    plugins?.dashboard?.dashboardCardMenu,
  );
};

export const addDefaultDashboardPluginValues = (
  plugins: MetabasePluginsConfig = {},
): MetabasePluginsConfig => {
  return {
    ...plugins,
    dashboard: {
      dashboardCardMenu: getDashcardMenu(plugins),
    },
  };
};

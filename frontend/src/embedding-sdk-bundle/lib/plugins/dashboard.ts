import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type { DashboardCardCustomMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";
import { deepMerge } from "metabase/utils/deep-merge";

const DEFAULT_DASHCARD_MENU_ITEMS: DashboardCardCustomMenuItem = {
  withDownloads: true,
  withEditLink: true,
  customItems: [],
};

const getDashcardMenu = (plugins: MetabasePluginsConfig) => {
  const dashboardCardMenu = plugins?.dashboard?.dashboardCardMenu;
  if (typeof dashboardCardMenu === "function") {
    return dashboardCardMenu;
  }
  return deepMerge(DEFAULT_DASHCARD_MENU_ITEMS, dashboardCardMenu);
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

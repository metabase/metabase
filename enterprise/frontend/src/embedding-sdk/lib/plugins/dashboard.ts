import { merge } from "icepick";

import type {
  SdkDashCardMenuPluginsConfig,
  SdkPluginsConfig,
} from "embedding-sdk";

const DEFAULT_DASHCARD_MENU_ITEMS: SdkDashCardMenuPluginsConfig = {
  dashcardMenu: {
    withDownloads: true,
    withEditLink: true,
    customItems: [],
  },
} as const;

const getDashcardMenu = (plugins: SdkPluginsConfig) => {
  if (typeof plugins?.dashboard?.dashcardMenu === "function") {
    return plugins?.dashboard?.dashcardMenu;
  }
  return merge(DEFAULT_DASHCARD_MENU_ITEMS, plugins?.dashboard?.dashcardMenu);
};

export const addDefaultDashboardPluginValues = (
  plugins: SdkPluginsConfig = {},
): SdkPluginsConfig => {
  return {
    ...plugins,
    dashboard: {
      dashcardMenu: getDashcardMenu(plugins),
    },
  };
};

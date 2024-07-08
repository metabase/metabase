import { merge } from "lodash";

import type {
  SdkDashcardMenuPluginsConfig,
  SdkPluginsConfig,
} from "embedding-sdk";

const DEFAULT_DASHCARD_MENU_ITEMS: SdkDashcardMenuPluginsConfig = {
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
  return merge(
    {},
    DEFAULT_DASHCARD_MENU_ITEMS,
    plugins?.dashboard?.dashcardMenu,
  );
};

export const initializeDashboardPlugin = (
  plugins: SdkPluginsConfig = {},
): SdkPluginsConfig => {
  return {
    ...plugins,
    dashboard: {
      dashcardMenu: getDashcardMenu(plugins),
    },
  };
};

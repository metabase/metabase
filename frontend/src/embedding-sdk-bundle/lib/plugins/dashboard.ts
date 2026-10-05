import { merge } from "icepick";

import type {
  DashboardCardMenu,
  MetabaseDashboardPluginsConfig,
  MetabasePluginsConfig,
} from "embedding-sdk-bundle/types/plugins";
import type { DashCardMenuSpec } from "metabase/dashboard/components/DashCard/DashCardMenu/dashcard-menu";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";

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

export const toDashCardMenuSpec = (
  dashboardCardMenu: DashboardCardMenu,
): DashCardMenuSpec => {
  if (typeof dashboardCardMenu === "function") {
    return ({ question, ...rest }) =>
      dashboardCardMenu({ question: transformSdkQuestion(question), ...rest });
  }

  const { customItems, ...menu } = dashboardCardMenu;

  return {
    ...menu,
    customItems: customItems?.map((item) =>
      typeof item === "function"
        ? ({ question }) =>
            item({ question: question && transformSdkQuestion(question) })
        : item,
    ),
  };
};

import { SDK_DASHBOARD_VIEW_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

export type EditableDashboardProps = SdkDashboardProps;
export const EditableDashboard = ({
  drillThroughQuestionProps,
  plugins,
  ...sdkDashboardProps
}: SdkDashboardProps) => {
  const dashboardActions = SDK_DASHBOARD_VIEW_ACTIONS;

  return (
    <SdkDashboard
      {...sdkDashboardProps}
      dashboardActions={dashboardActions}
      plugins={plugins}
      getClickActionMode={({ question }) =>
        getEmbeddingMode({
          question,
          queryMode: EmbeddingSdkMode,
          plugins: plugins as InternalMetabasePluginsConfig,
        })
      }
    />
  );
};

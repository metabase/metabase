import { SDK_DASHBOARD_VIEW_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type Question from "metabase-lib/v1/Question";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category InteractiveDashboard
 */
export type EditableDashboardProps = SdkDashboardProps;

/**
 * A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.
 *
 * @function
 * @category InteractiveDashboard
 * @param props
 */
export const EditableDashboard = ({
  drillThroughQuestionProps,
  plugins,
  ...sdkDashboardProps
}: EditableDashboardProps) => {
  const dashboardActions = SDK_DASHBOARD_VIEW_ACTIONS;

  return (
    <SdkDashboard
      {...sdkDashboardProps}
      dashboardActions={dashboardActions}
      plugins={plugins}
      getClickActionMode={({ question }: { question: Question }) =>
        getEmbeddingMode({
          question,
          queryMode: EmbeddingSdkMode,
          plugins: plugins as InternalMetabasePluginsConfig,
        })
      }
    />
  );
};

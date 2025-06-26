import {
  DASHBOARD_EDITING_ACTIONS,
  SDK_DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";

import {
  SdkDashboard,
  type SdkDashboardInnerProps,
  type SdkDashboardProps,
} from "../SdkDashboard";

/**
 * @expand
 */
export type EditableDashboardProps = SdkDashboardProps;

export const EditableDashboard = (props: EditableDashboardProps) => {
  const dashboardActions: SdkDashboardInnerProps["dashboardActions"] = ({
    isEditing,
    downloadsEnabled,
  }) =>
    isEditing
      ? DASHBOARD_EDITING_ACTIONS
      : downloadsEnabled.pdf
        ? [...SDK_DASHBOARD_VIEW_ACTIONS, DASHBOARD_ACTION.DOWNLOAD_PDF]
        : SDK_DASHBOARD_VIEW_ACTIONS;

  const getClickActionMode: SdkDashboardInnerProps["getClickActionMode"] = ({
    question,
  }) =>
    getEmbeddingMode({
      question,
      queryMode: EmbeddingSdkMode,
      plugins: props.drillThroughQuestionProps
        ?.plugins as InternalMetabasePluginsConfig,
    });

  return (
    <SdkDashboard
      {...props}
      getClickActionMode={getClickActionMode}
      dashboardActions={dashboardActions}
    />
  );
};

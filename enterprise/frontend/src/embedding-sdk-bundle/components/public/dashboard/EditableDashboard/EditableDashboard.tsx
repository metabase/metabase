import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsStaticEmbedding } from "embedding-sdk-bundle/store/selectors";
import { DASHBOARD_EDITING_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";

import {
  type EditableDashboardOwnProps,
  SdkDashboard,
  type SdkDashboardInnerProps,
  type SdkDashboardProps,
} from "../SdkDashboard";

import { editableDashboardSchema } from "./EditableDashboard.schema";

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type EditableDashboardProps = SdkDashboardProps &
  EditableDashboardOwnProps;

export const EditableDashboardInner = (props: EditableDashboardProps) => {
  const isStaticEmbedding = useSdkSelector(getIsStaticEmbedding);

  const dashboardActions: SdkDashboardInnerProps["dashboardActions"] = ({
    isEditing,
    downloadsEnabled,
  }) =>
    isEditing
      ? DASHBOARD_EDITING_ACTIONS
      : downloadsEnabled.pdf
        ? [DASHBOARD_ACTION.EDIT_DASHBOARD, DASHBOARD_ACTION.DOWNLOAD_PDF]
        : [DASHBOARD_ACTION.EDIT_DASHBOARD];

  const getClickActionMode: SdkDashboardInnerProps["getClickActionMode"] = ({
    question,
  }) =>
    getEmbeddingMode({
      question,
      isStaticEmbedding,
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

export const EditableDashboard = Object.assign(EditableDashboardInner, {
  schema: editableDashboardSchema,
});

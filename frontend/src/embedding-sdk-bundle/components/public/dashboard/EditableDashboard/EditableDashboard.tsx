import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { DASHBOARD_EDITING_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";

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
  const dashboardActions: SdkDashboardInnerProps["dashboardActions"] = ({
    isEditing,
  }) =>
    isEditing
      ? DASHBOARD_EDITING_ACTIONS
      : [
          DASHBOARD_ACTION.EDIT_DASHBOARD,
          DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
          DASHBOARD_ACTION.DOWNLOAD_PDF,
        ];

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

export const EditableDashboard = Object.assign(
  withPublicComponentWrapper(EditableDashboardInner, {
    supportsGuestEmbed: false,
  }),
  {
    schema: editableDashboardSchema,
  },
);

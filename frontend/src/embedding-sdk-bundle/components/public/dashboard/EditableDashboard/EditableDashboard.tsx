import { useCallback } from "react";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkInternalNavigationProvider } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationProvider";
import { useSdkInternalNavigation } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { DASHBOARD_EDITING_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { createEmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";

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

const EditableDashboardContent = (props: EditableDashboardProps) => {
  const { push: pushNavigation } = useSdkInternalNavigation();

  const dashboardActions: SdkDashboardInnerProps["dashboardActions"] = ({
    isEditing,
  }) =>
    isEditing
      ? DASHBOARD_EDITING_ACTIONS
      : [
          DASHBOARD_ACTION.EDIT_DASHBOARD,
          DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
          DASHBOARD_ACTION.DOWNLOAD_PDF,
          DASHBOARD_ACTION.REFRESH_INDICATOR,
        ];

  const getClickActionMode: SdkDashboardInnerProps["getClickActionMode"] =
    useCallback(
      ({
        question,
      }: Parameters<
        NonNullable<SdkDashboardInnerProps["getClickActionMode"]>
      >[0]) =>
        getEmbeddingMode({
          question,
          queryMode: createEmbeddingSdkMode({ pushNavigation }),
          plugins: props.drillThroughQuestionProps
            ?.plugins as InternalMetabasePluginsConfig,
        }),
      [pushNavigation, props.drillThroughQuestionProps?.plugins],
    );

  return (
    <SdkDashboard
      {...props}
      getClickActionMode={getClickActionMode}
      dashboardActions={dashboardActions}
    />
  );
};

export const EditableDashboardInner = (props: EditableDashboardProps) => {
  return (
    <SdkInternalNavigationProvider
      style={props.style}
      className={props.className}
      dashboardProps={props}
    >
      <EditableDashboardContent {...props} />
    </SdkInternalNavigationProvider>
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

import { useCallback, useMemo } from "react";

import { useTrackSdkComponentMount } from "embedding-sdk-bundle/analytics/component-events";
import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkInternalNavigationProvider } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationProvider";
import { useSdkInternalNavigation } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getPlugins } from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
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
  const globalPlugins = useSdkSelector(getPlugins);
  const { push: pushNavigation } = useSdkInternalNavigation();

  const {
    dashboardId,
    withTitle,
    withDownloads,
    withSubscriptions,
    autoRefreshInterval,
    enableEntityNavigation,
  } = props;

  useTrackSdkComponentMount("EditableDashboard", dashboardId, {
    with_title: withTitle,
    with_downloads: withDownloads,
    with_subscriptions: withSubscriptions,
    auto_refresh: autoRefreshInterval != null,
    enable_entity_navigation: enableEntityNavigation,
  });

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

  const plugins: MetabasePluginsConfig = useMemo(() => {
    return { ...globalPlugins, ...props.plugins };
  }, [globalPlugins, props.plugins]);

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
          plugins: plugins as InternalMetabasePluginsConfig,
        }),
      [plugins, pushNavigation],
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

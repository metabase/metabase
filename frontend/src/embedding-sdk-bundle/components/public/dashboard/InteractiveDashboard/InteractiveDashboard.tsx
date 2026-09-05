import { useMemo } from "react";

import { useTrackSdkComponentMount } from "embedding-sdk-bundle/analytics/component-events";
import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkInternalNavigationProvider } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationProvider";
import { useSdkInternalNavigation } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { createEmbeddingSdkMode } from "embedding-sdk-bundle/lib/modes/EmbeddingSdkMode";
import { getEmbeddingMode } from "embedding-sdk-bundle/lib/modes/getEmbeddingMode";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getPlugins } from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { isQuestionCard } from "metabase/utils/dashboard";

import {
  SdkDashboard,
  type SdkDashboardInnerProps,
  type SdkDashboardProps,
} from "../SdkDashboard";

import { interactiveDashboardSchema } from "./InteractiveDashboard.schema";

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type InteractiveDashboardProps = SdkDashboardProps;

export const InteractiveDashboardContent = (
  props: InteractiveDashboardProps,
) => {
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

  useTrackSdkComponentMount("InteractiveDashboard", dashboardId, {
    with_title: withTitle,
    with_downloads: withDownloads,
    with_subscriptions: withSubscriptions,
    auto_refresh: autoRefreshInterval != null,
    enable_entity_navigation: enableEntityNavigation,
  });

  const plugins: MetabasePluginsConfig = useMemo(() => {
    return { ...globalPlugins, ...props.plugins };
  }, [globalPlugins, props.plugins]);

  const clickActionMode = useMemo(
    () =>
      getEmbeddingMode({
        queryMode: createEmbeddingSdkMode({ pushNavigation }),
        // Unjustified type cast. FIXME
        plugins: plugins as InternalMetabasePluginsConfig,
      }),
    [plugins, pushNavigation],
  );

  const dashboardProps: SdkDashboardInnerProps = useMemo(
    () => ({
      ...props,
      clickActionMode,
      dashboardActions: [
        DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
        DASHBOARD_ACTION.DOWNLOAD_PDF,
        DASHBOARD_ACTION.REFRESH_INDICATOR,
      ],
      dashcardMenu: ({ dashcard, result, downloadsEnabled }) =>
        downloadsEnabled?.results &&
        isQuestionCard(dashcard.card) &&
        !!result?.data &&
        !result?.error && (
          <PublicOrEmbeddedDashCardMenu result={result} dashcard={dashcard} />
        ),
    }),
    [props, clickActionMode],
  );

  return <SdkDashboard {...dashboardProps} />;
};

const InteractiveDashboardInner = (props: InteractiveDashboardProps) => {
  return (
    <SdkInternalNavigationProvider
      style={props.style}
      className={props.className}
      dashboardProps={props}
      renderDrillThroughQuestion={props.renderDrillThroughQuestion}
      drillThroughQuestionProps={props.drillThroughQuestionProps}
    >
      <InteractiveDashboardContent {...props} />
    </SdkInternalNavigationProvider>
  );
};

export const InteractiveDashboard = Object.assign(
  withPublicComponentWrapper(InteractiveDashboardInner, {
    supportsGuestEmbed: false,
  }),
  {
    schema: interactiveDashboardSchema,
  },
);

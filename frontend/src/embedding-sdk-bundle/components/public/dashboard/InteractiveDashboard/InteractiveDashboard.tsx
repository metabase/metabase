import { useCallback, useEffect, useMemo } from "react";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkInternalNavigationProvider } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationProvider";
import { useSdkInternalNavigation } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getPlugins } from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { isQuestionCard } from "metabase/dashboard/utils";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { createEmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

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

// Inner component that uses the navigation context
export const InteractiveDashboardContent = (
  props: InteractiveDashboardProps,
) => {
  const globalPlugins = useSdkSelector(getPlugins);
  const {
    push: pushNavigation,
    initWithDashboard,
    navigateToNewCardFromDashboard,
  } = useSdkInternalNavigation();
  const dashboard = useSdkSelector(getDashboardComplete);

  // Initialize the navigation stack with the dashboard when it loads
  useEffect(() => {
    if (dashboard?.id != null && dashboard?.name) {
      initWithDashboard({
        id:
          typeof dashboard.id === "number"
            ? dashboard.id
            : parseInt(String(dashboard.id), 10),
        name: dashboard.name,
      });
    }
  }, [dashboard?.id, dashboard?.name, initWithDashboard]);

  const plugins: MetabasePluginsConfig = useMemo(() => {
    return { ...globalPlugins, ...props.plugins };
  }, [globalPlugins, props.plugins]);

  const getClickActionMode: ClickActionModeGetter = useCallback(
    ({ question }) =>
      getEmbeddingMode({
        question,
        queryMode: createEmbeddingSdkMode({ pushNavigation }),
        plugins: plugins as InternalMetabasePluginsConfig,
      }),
    [plugins, pushNavigation],
  );

  const dashboardProps: SdkDashboardInnerProps = useMemo(
    () => ({
      ...props,
      getClickActionMode,
      navigateToNewCardFromDashboard,
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
    [props, getClickActionMode, navigateToNewCardFromDashboard],
  );

  return <SdkDashboard {...dashboardProps} />;
};

// Outer component that provides the navigation context
const InteractiveDashboardInner = (props: InteractiveDashboardProps) => {
  return (
    <SdkInternalNavigationProvider
      dashboardId={props.dashboardId}
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

import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkInternalNavigationProvider } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationProvider";
import { useSdkInternalNavigation } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";
import { useSdkSelector, useSdkStore } from "embedding-sdk-bundle/store";
import { getPlugins } from "embedding-sdk-bundle/store/selectors";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { isQuestionCard } from "metabase/dashboard/utils";
import type { MetabasePluginsConfig as InternalMetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { createEmbeddingSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import { cardIsEquivalent } from "metabase-lib/v1/queries/utils/card";
import type { QuestionDashboardCard } from "metabase-types/api";

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
  const { push: pushNavigation, initWithDashboard } =
    useSdkInternalNavigation();
  const store = useSdkStore();
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

  // Custom navigateToNewCardFromDashboard that uses the internal navigation stack
  // instead of URL-based navigation. This is used for drills and "go to card" actions.
  const navigateToNewCardFromDashboard = useCallback(
    ({
      nextCard,
      previousCard,
      dashcard,
      objectId,
    }: NavigateToNewCardFromDashboardOpts) => {
      const state = store.getState();
      const metadata = getMetadata(state);
      const { dashboards, parameterValues } = state.dashboard;
      const dashboardId = props.dashboardId;

      if (dashboardId === null) {
        console.warn(
          "[SDK Navigation] dashboardId is null in navigateToNewCardFromDashboard",
        );
        return;
      }

      // Find the dashboard by ID (numeric or entity ID)
      const dashboard = Object.values(dashboards).find(
        (d) =>
          d.id === dashboardId ||
          d.entity_id === dashboardId ||
          String(d.id) === String(dashboardId),
      );

      if (dashboard) {
        // Check if this is a "go to card" action (clicking card title) vs a drill action
        // When clicking on a card title, nextCard and previousCard are equivalent
        const isGoToCardAction =
          cardIsEquivalent(nextCard, previousCard) && nextCard.id != null;

        if (isGoToCardAction) {
          // Navigate to the saved question directly
          pushNavigation({
            type: "question",
            id: nextCard.id,
            name: nextCard.name || t`Question`,
          });
        } else {
          // This is a drill action - generate URL for adhoc question
          const url = getNewCardUrl({
            metadata,
            dashboard,
            parameterValues,
            nextCard,
            previousCard,
            dashcard: dashcard as QuestionDashboardCard,
            objectId,
          });

          if (url) {
            pushNavigation({
              type: "adhoc-question",
              questionPath: url,
              name: nextCard.name || t`Question`,
            });
          }
        }
      }
    },
    [store, props.dashboardId, pushNavigation],
  );

  const dashboardProps: SdkDashboardInnerProps = useMemo(
    () => ({
      ...props,
      getClickActionMode,
      navigateToNewCardFromDashboard,
      dashboardActions: [
        DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
        DASHBOARD_ACTION.DOWNLOAD_PDF,
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

import { useTrackSdkComponentMount } from "embedding-sdk-bundle/analytics/component-events";
import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useNormalizeGuestEmbedQuestionOrDashboardComponentProps } from "embedding-sdk-bundle/hooks/private/use-normalize-guest-embed-question-or-dashboard-component-props";
import { EmbeddingSdkStaticMode } from "embedding-sdk-bundle/lib/modes/EmbeddingSdkStaticMode";
import { getEmbeddingMode } from "embedding-sdk-bundle/lib/modes/getEmbeddingMode";
import type { SdkDashboardEntityPublicProps } from "embedding-sdk-bundle/types/dashboard";
import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import { isQuestionCard } from "metabase/utils/dashboard";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

import { staticDashboardSchema } from "./StaticDashboard.schema";

const staticClickActionMode = getEmbeddingMode({
  queryMode: EmbeddingSdkStaticMode,
});

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type StaticDashboardProps = Omit<
  SdkDashboardProps,
  | "dashboardId"
  | "token"
  | "drillThroughQuestionProps"
  | "drillThroughQuestionHeight"
  | "renderDrillThroughQuestion"
  | "enableEntityNavigation"
> &
  SdkDashboardEntityPublicProps;

const StaticDashboardInner = (props: StaticDashboardProps) => {
  // Normalize props for Guest Embed usage (e.g. enforce withDownloads in OSS).
  const normalizedProps =
    useNormalizeGuestEmbedQuestionOrDashboardComponentProps(props);

  const { withDownloads, withTitle, withSubscriptions, autoRefreshInterval } =
    normalizedProps;

  const dashboardId = "dashboardId" in props ? props.dashboardId : undefined;

  useTrackSdkComponentMount(
    "StaticDashboard",
    dashboardId != null ? dashboardId : null,
    {
      with_title: withTitle,
      with_downloads: withDownloads,
      with_subscriptions: withSubscriptions,
      auto_refresh: autoRefreshInterval != null,
    },
  );

  return (
    <SdkDashboard
      // Unjustified type cast. FIXME
      {...(normalizedProps as SdkDashboardProps)}
      clickActionMode={staticClickActionMode}
      dashboardActions={[
        DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
        DASHBOARD_ACTION.DOWNLOAD_PDF,
        DASHBOARD_ACTION.REFRESH_INDICATOR,
      ]}
      navigateToNewCardFromDashboard={null}
      dashcardMenu={({ dashcard, result }) =>
        withDownloads &&
        isQuestionCard(dashcard.card) &&
        !!result?.data &&
        !result?.error && (
          <PublicOrEmbeddedDashCardMenu result={result} dashcard={dashcard} />
        )
      }
    />
  );
};

export const StaticDashboard = Object.assign(
  withPublicComponentWrapper(StaticDashboardInner, {
    supportsGuestEmbed: true,
  }),
  {
    schema: staticDashboardSchema,
  },
);

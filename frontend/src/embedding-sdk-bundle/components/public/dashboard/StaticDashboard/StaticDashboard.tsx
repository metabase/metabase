import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useNormalizeGuestEmbedQuestionOrDashboardComponentProps } from "embedding-sdk-bundle/hooks/private/use-normalize-guest-embed-question-or-dashboard-component-props";
import type { SdkDashboardEntityPublicProps } from "embedding-sdk-bundle/types/dashboard";
import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import { isQuestionCard } from "metabase/dashboard/utils";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import { EmbeddingSdkStaticMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkStaticMode";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

import { staticDashboardSchema } from "./StaticDashboard.schema";

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

  const { withDownloads } = normalizedProps;

  const getClickActionMode: ClickActionModeGetter = ({ question }) =>
    getEmbeddingMode({
      question,
      queryMode: EmbeddingSdkStaticMode,
    });

  return (
    <SdkDashboard
      {...(normalizedProps as SdkDashboardProps)}
      getClickActionMode={getClickActionMode}
      dashboardActions={[
        DASHBOARD_ACTION.DASHBOARD_SUBSCRIPTIONS,
        DASHBOARD_ACTION.DOWNLOAD_PDF,
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

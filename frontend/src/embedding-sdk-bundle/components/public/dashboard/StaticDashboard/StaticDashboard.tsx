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
> &
  SdkDashboardEntityPublicProps;

const StaticDashboardInner = (props: StaticDashboardProps) => {
  const getClickActionMode: ClickActionModeGetter = ({ question }) =>
    getEmbeddingMode({
      question,
      queryMode: EmbeddingSdkStaticMode,
    });

  return (
    <SdkDashboard
      {...(props as SdkDashboardProps)}
      getClickActionMode={getClickActionMode}
      dashboardActions={({ downloadsEnabled }) =>
        downloadsEnabled.pdf ? [DASHBOARD_ACTION.DOWNLOAD_PDF] : []
      }
      navigateToNewCardFromDashboard={null}
      dashcardMenu={({ dashcard, result }) =>
        props.withDownloads &&
        isQuestionCard(dashcard.card) &&
        !!result?.data &&
        !result?.error && (
          <PublicOrEmbeddedDashCardMenu result={result} dashcard={dashcard} />
        )
      }
    />
  );
};

export const StaticDashboard = Object.assign(StaticDashboardInner, {
  schema: staticDashboardSchema,
});

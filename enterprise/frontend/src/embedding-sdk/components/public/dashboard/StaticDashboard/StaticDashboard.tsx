import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import { isQuestionCard } from "metabase/dashboard/utils";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

import { StaticQuestionSdkMode } from "../../StaticQuestion/mode";
import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

/**
 * @interface
 * @expand
 * @category Dashboard
 */
export type StaticDashboardProps = SdkDashboardProps;

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category Dashboard
 * @param props
 */
export const StaticDashboard = (props: StaticDashboardProps) => {
  const getClickActionMode: ClickActionModeGetter = ({ question }) =>
    getEmbeddingMode({
      question,
      queryMode: StaticQuestionSdkMode,
    });

  return (
    <SdkDashboard
      {...props}
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

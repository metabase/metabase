import { DashCardQuestionDownloadButton } from "metabase/dashboard/components/DashCard/DashCardQuestionDownloadButton";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
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
        downloadsEnabled.pdf
          ? [...DASHBOARD_DISPLAY_ACTIONS, DASHBOARD_ACTION.DOWNLOAD_PDF]
          : DASHBOARD_DISPLAY_ACTIONS
      }
      navigateToNewCardFromDashboard={null}
      dashcardMenu={({ dashcard, result }) =>
        props.withDownloads &&
        isQuestionCard(dashcard.card) &&
        !!result?.data &&
        !result?.error && (
          <DashCardQuestionDownloadButton result={result} dashcard={dashcard} />
        )
      }
    />
  );
};

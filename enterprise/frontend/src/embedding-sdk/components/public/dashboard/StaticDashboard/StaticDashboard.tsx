import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";

import { SdkDashboard, type SdkDashboardProps } from "..";
import { StaticQuestionSdkMode } from "../../StaticQuestion/mode";

export type StaticDashboardProps = SdkDashboardProps;

/**
 * A lightweight dashboard component.
 *
 * @function
 * @category StaticDashboard
 */
export const StaticDashboard = (props: SdkDashboardProps) => {
  const getClickActionMode: ClickActionModeGetter = ({ question }) =>
    getEmbeddingMode({
      question,
      queryMode: StaticQuestionSdkMode,
    });

  return (
    <SdkDashboard
      {...props}
      getClickActionMode={getClickActionMode}
      dashboardActions={DASHBOARD_DISPLAY_ACTIONS}
      navigateToNewCardFromDashboard={null}
    />
  );
};

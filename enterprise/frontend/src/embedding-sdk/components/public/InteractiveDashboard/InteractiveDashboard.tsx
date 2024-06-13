import type { Query } from "history";
import { useState } from "react";

import { InteractiveAdHocQuestion } from "embedding-sdk/components/public/InteractiveDashboard/InteractiveAdHocQuestion";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import { useStore } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { DashboardId } from "metabase-types/api";

import { StaticDashboard } from "../StaticDashboard";

export type InteractiveDashboardProps = {
  dashboardId: DashboardId;
  initialParameterValues?: Query;
  withTitle?: boolean;
  withDownloads?: boolean;
  hiddenParameters?: string[];
};

export const InteractiveDashboard = (props: InteractiveDashboardProps) => {
  const { dashboardId, withTitle } = props;

  const store = useStore();
  // const globalPlugins = useSdkSelector(getPlugins); // TODO: add plugins support

  const [adhocQuestionUrl, setAdhocQuestionUrl] = useState(null);

  const handleNavigateToNewCardFromDashboard = ({
    nextCard,
    previousCard,
    dashcard,
    objectId,
  }) => {
    const state = store.getState();
    const metadata = getMetadata(state);
    const { dashboards, parameterValues } = state.dashboard;
    const dashboard = dashboards[dashboardId];

    if (dashboard) {
      const url = getNewCardUrl({
        metadata,
        dashboard,
        parameterValues,
        nextCard,
        previousCard,
        dashcard,
        objectId,
      });

      setAdhocQuestionUrl(url);
    }
  };

  if (adhocQuestionUrl) {
    return (
      <InteractiveAdHocQuestion
        questionUrl={adhocQuestionUrl}
        withTitle={withTitle}
        onNavigateBack={() => setAdhocQuestionUrl(null)}
      />
    );
  }

  return (
    <StaticDashboard
      {...props}
      navigateToNewCardFromDashboard={handleNavigateToNewCardFromDashboard}
    />
  );
};

import { useState } from "react";

import type { SdkClickActionPluginsConfig } from "embedding-sdk";
import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { useStore } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { QuestionDashboardCard } from "metabase-types/api";

import {
  _StaticDashboard,
  type StaticDashboardProps,
} from "../StaticDashboard";

export type InteractiveDashboardProps = StaticDashboardProps & {
  questionHeight?: number;
  questionPlugins?: SdkClickActionPluginsConfig;
};

const _InteractiveDashboard = (props: InteractiveDashboardProps) => {
  const { dashboardId, withTitle, questionHeight, questionPlugins } = props;

  const store = useStore();

  const [adhocQuestionUrl, setAdhocQuestionUrl] = useState<string | null>(null);

  const handleNavigateToNewCardFromDashboard = ({
    nextCard,
    previousCard,
    dashcard,
    objectId,
  }: NavigateToNewCardFromDashboardOpts) => {
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
        dashcard: dashcard as QuestionDashboardCard,
        objectId,
      });

      if (url) {
        setAdhocQuestionUrl(url);
      }
    }
  };

  if (adhocQuestionUrl) {
    return (
      <InteractiveAdHocQuestion
        questionPath={adhocQuestionUrl}
        withTitle={withTitle}
        height={questionHeight}
        plugins={questionPlugins}
        onNavigateBack={() => setAdhocQuestionUrl(null)}
      />
    );
  }

  return (
    <_StaticDashboard
      {...props}
      navigateToNewCardFromDashboard={handleNavigateToNewCardFromDashboard}
    />
  );
};

export const InteractiveDashboard = withPublicComponentWrapper(
  _InteractiveDashboard,
);

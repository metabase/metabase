import React from "react";
import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import type {
  Dashboard,
  DashboardOrderedCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import DashCardActionButton from "./DashCardActionButton";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: DashboardOrderedCard;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
}

function ChartSettingsButton({
  series,
  dashboard,
  dashcard,
  onReplaceAllVisualizationSettings,
}: Props) {
  return (
    <ModalWithTrigger
      wide
      tall
      triggerElement={
        <DashCardActionButton tooltip={t`Visualization options`}>
          <DashCardActionButton.Icon name="palette" />
        </DashCardActionButton>
      }
      enableMouseEvents
    >
      <ChartSettingsWithState
        className="spread"
        series={series}
        onChange={onReplaceAllVisualizationSettings}
        isDashboard
        dashboard={dashboard}
        dashcard={dashcard}
      />
    </ModalWithTrigger>
  );
}

export default ChartSettingsButton;

import React from "react";
import _ from "underscore";
import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import { Dashboard, VisualizationSettings } from "metabase-types/api";
import { Series } from "metabase-types/types/Visualization";

import DashCardActionButton from "./DashCardActionButton";

interface Props {
  series: Series;
  dashboard: Dashboard;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
}

function ChartSettingsButton({
  series,
  dashboard,
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
      />
    </ModalWithTrigger>
  );
}

export default ChartSettingsButton;

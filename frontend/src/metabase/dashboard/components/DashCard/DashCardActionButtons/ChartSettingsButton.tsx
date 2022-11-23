import React from "react";
import _ from "underscore";
import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import { VisualizationSettings } from "metabase-types/api/card";
import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { Series } from "metabase-types/types/Visualization";

import DashCardActionButton from "./DashCardActionButton";

interface Props {
  series: Series;
  dashboard: DashboardWithCards;
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

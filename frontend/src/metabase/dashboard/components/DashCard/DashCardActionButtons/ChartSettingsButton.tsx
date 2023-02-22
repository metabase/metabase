import React from "react";
import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import {
  Dashboard,
  DashboardOrderedCard,
  VisualizationSettings,
} from "metabase-types/api";
import { Series } from "metabase-types/types/Visualization";
import Metadata from "metabase-lib/metadata/Metadata";
import Question from "metabase-lib/Question";

import DashCardActionButton from "./DashCardActionButton";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: DashboardOrderedCard;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  metadata: Metadata;
}

function ChartSettingsButton({
  series,
  dashboard,
  dashcard,
  onReplaceAllVisualizationSettings,
  metadata,
}: Props) {
  const question = new Question(series[0].card, metadata);

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
        metadata={metadata}
        question={question}
      />
    </ModalWithTrigger>
  );
}

export default ChartSettingsButton;

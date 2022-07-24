/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import DashActionButton from "./DashActionButton";

function ChartSettingsButton({
  series,
  onReplaceAllVisualizationSettings,
  dashboard,
}) {
  return (
    <ModalWithTrigger
      wide
      tall
      triggerElement={
        <DashActionButton tooltip={t`Visualization options`}>
          <DashActionButton.Icon name="palette" />
        </DashActionButton>
      }
      triggerClasses="mr1"
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

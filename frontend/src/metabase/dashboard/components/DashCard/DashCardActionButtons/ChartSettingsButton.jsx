/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import { HEADER_ICON_SIZE } from "./constants";
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
          <Icon name="palette" size={HEADER_ICON_SIZE} />
        </DashActionButton>
      }
      triggerClasses="text-dark-hover cursor-pointer flex align-center flex-no-shrink mr1 drag-disabled"
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

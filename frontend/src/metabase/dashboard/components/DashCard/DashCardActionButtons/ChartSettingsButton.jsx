/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

const HEADER_ICON_SIZE = 16;

const HEADER_ACTION_STYLE = {
  padding: 4,
};

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
        <Tooltip tooltip={t`Visualization options`}>
          <Icon
            name="palette"
            size={HEADER_ICON_SIZE}
            style={HEADER_ACTION_STYLE}
          />
        </Tooltip>
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

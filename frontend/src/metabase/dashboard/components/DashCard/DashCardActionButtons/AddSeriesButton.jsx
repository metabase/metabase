/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import visualizations from "metabase/visualizations";

const HEADER_ICON_SIZE = 16;

const HEADER_ACTION_STYLE = {
  padding: 4,
};

function getSeriesIconName(series) {
  try {
    const display = series[0].card.display;
    return visualizations.get(display === "scalar" ? "bar" : display).iconName;
  } catch (e) {
    return "bar";
  }
}

function AddSeriesButton({ series, onAddSeries }) {
  return (
    <a
      data-testid="add-series-button"
      data-metabase-event="Dashboard;Edit Series Modal;open"
      className="text-dark-hover cursor-pointer h3 flex-no-shrink relative mr1 drag-disabled"
      onClick={onAddSeries}
      style={HEADER_ACTION_STYLE}
    >
      <Tooltip tooltip={series.length > 1 ? t`Edit series` : t`Add series`}>
        <span className="flex align-center">
          <span className="flex">
            <Icon
              className="absolute"
              name="add"
              style={{ top: 0, left: 1 }}
              size={HEADER_ICON_SIZE / 2}
            />
            <Icon
              name={getSeriesIconName(series)}
              size={HEADER_ICON_SIZE - 2}
            />
          </span>
        </span>
      </Tooltip>
    </a>
  );
}

export default AddSeriesButton;

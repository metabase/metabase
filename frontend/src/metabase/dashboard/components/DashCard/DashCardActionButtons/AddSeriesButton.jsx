/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import visualizations from "metabase/visualizations";

import { HEADER_ICON_SIZE } from "./constants";
import DashActionButton from "./DashActionButton";

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
    <DashActionButton
      className="h3 flex-no-shrink relative mr1"
      onClick={onAddSeries}
      tooltip={series.length > 1 ? t`Edit series` : t`Add series`}
      analyticsEvent="Edit Series Modal;open"
      data-testid="add-series-button"
    >
      <span className="flex align-center">
        <span className="flex">
          <Icon
            name="add"
            style={{ top: 0, left: 1 }}
            size={HEADER_ICON_SIZE / 2}
          />
          <Icon name={getSeriesIconName(series)} size={HEADER_ICON_SIZE - 2} />
        </span>
      </span>
    </DashActionButton>
  );
}

export default AddSeriesButton;

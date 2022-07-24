import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import visualizations from "metabase/visualizations";

import { Series } from "metabase-types/types/Visualization";

import DashActionButton from "./DashActionButton";
import {
  AddSeriesPlusIcon,
  HEADER_ICON_SIZE,
} from "./DashboardActionButtons.styled";

function getSeriesIconName(series: Series) {
  try {
    const display = series[0].card.display;
    return visualizations.get(display === "scalar" ? "bar" : display).iconName;
  } catch (e) {
    return "bar";
  }
}

function AddSeriesButton({
  series,
  onClick,
}: {
  series: Series;
  onClick: () => void;
}) {
  return (
    <DashActionButton
      className="relative"
      onClick={onClick}
      tooltip={series.length > 1 ? t`Edit series` : t`Add series`}
      analyticsEvent="Edit Series Modal;open"
      data-testid="add-series-button"
    >
      <span className="flex">
        <AddSeriesPlusIcon name="add" size={HEADER_ICON_SIZE / 2} />
        <Icon name={getSeriesIconName(series)} size={HEADER_ICON_SIZE - 2} />
      </span>
    </DashActionButton>
  );
}

export default AddSeriesButton;

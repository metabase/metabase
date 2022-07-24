/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { getVisualizationRaw } from "metabase/visualizations";

import DashActionButton from "./DashActionButton";

import AddSeriesButton from "./AddSeriesButton";
import ChartSettingsButton from "./ChartSettingsButton";
import RemoveButton from "./RemoveButton";
import ToggleCardPreviewButton from "./ToggleCardPreviewButton";

import { DashCardActionButtonsContainer } from "./DashboardActionButtons.styled";

function DashCardActionButtons({
  series,
  isLoading,
  isVirtualDashCard,
  hasError,
  onRemove,
  onAddSeries,
  onReplaceAllVisualizationSettings,
  showClickBehaviorSidebar,
  onPreviewToggle,
  isPreviewing,
  dashboard,
}) {
  const { disableSettingsConfig, supportPreviewing, supportsSeries } =
    getVisualizationRaw(series).visualization;

  const buttons = [];

  if (supportPreviewing) {
    buttons.push(
      <ToggleCardPreviewButton
        key="toggle-card-preview-button"
        isPreviewing={isPreviewing}
        onPreviewToggle={onPreviewToggle}
      />,
    );
  }

  if (!isLoading && !hasError) {
    if (onReplaceAllVisualizationSettings && !disableSettingsConfig) {
      buttons.push(
        <ChartSettingsButton
          key="chart-settings-button"
          series={series}
          dashboard={dashboard}
          onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
        />,
      );
    }

    if (!isVirtualDashCard) {
      buttons.push(
        <DashActionButton
          key="click-behavior-tooltip"
          tooltip={t`Click behavior`}
          analyticsEvent="Open Click Behavior Sidebar"
          onClick={showClickBehaviorSidebar}
        >
          <Icon name="click" />
        </DashActionButton>,
      );
    }

    if (supportsSeries) {
      buttons.push(
        <AddSeriesButton
          key="add-series-button"
          series={series}
          onAddSeries={onAddSeries}
        />,
      );
    }
  }

  return (
    <DashCardActionButtonsContainer>
      {buttons}
      <RemoveButton onRemove={onRemove} />
    </DashCardActionButtonsContainer>
  );
}

export default DashCardActionButtons;

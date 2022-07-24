/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { getVisualizationRaw } from "metabase/visualizations";

import DashActionButton from "./DashActionButton";

import AddSeriesButton from "./AddSeriesButton";
import ChartSettingsButton from "./ChartSettingsButton";

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
      <DashActionButton
        onClick={onPreviewToggle}
        tooltip={isPreviewing ? t`Edit` : t`Preview`}
        analyticsEvent="Text;edit"
      >
        {isPreviewing ? (
          <DashActionButton.Icon name="edit_document" />
        ) : (
          <DashActionButton.Icon name="eye" size={18} />
        )}
      </DashActionButton>,
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
      <DashActionButton
        analyticsEvent="Remove Card Modal"
        onClick={onRemove}
        tooltip={t`Remove`}
      >
        <DashActionButton.Icon name="close" />
      </DashActionButton>
    </DashCardActionButtonsContainer>
  );
}

export default DashCardActionButtons;

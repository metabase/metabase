/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { getVisualizationRaw } from "metabase/visualizations";

import { isActionCard } from "metabase/writeback/utils";

import AddSeriesButton from "./AddSeriesButton";
import ChartSettingsButton from "./ChartSettingsButton";

import DashCardActionButton from "./DashCardActionButton";
import { DashCardActionButtonsContainer } from "./DashCardActionButtons.styled";

function DashCardActionButtons({
  card,
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
  const buttons = [];

  if (getVisualizationRaw(series).visualization.supportPreviewing) {
    buttons.push(
      <DashCardActionButton
        onClick={onPreviewToggle}
        tooltip={isPreviewing ? t`Edit` : t`Preview`}
        analyticsEvent="Dashboard;Text;edit"
      >
        {isPreviewing ? (
          <DashCardActionButton.Icon name="edit_document" />
        ) : (
          <DashCardActionButton.Icon name="eye" size={18} />
        )}
      </DashCardActionButton>,
    );
  }

  if (!isLoading && !hasError) {
    if (
      onReplaceAllVisualizationSettings &&
      !getVisualizationRaw(series).visualization.disableSettingsConfig
    ) {
      buttons.push(
        <ChartSettingsButton
          key="chart-settings-button"
          series={series}
          onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
          dashboard={dashboard}
        />,
      );
    }
    if (!isVirtualDashCard || isActionCard(card)) {
      buttons.push(
        <DashCardActionButton
          key="click-behavior-tooltip"
          onClick={showClickBehaviorSidebar}
          tooltip={t`Click behavior`}
          analyticsEvent="Dashboard;Open Click Behavior Sidebar"
        >
          <Icon name="click" />
        </DashCardActionButton>,
      );
    }

    if (getVisualizationRaw(series).visualization.supportsSeries) {
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
      <DashCardActionButton
        onClick={onRemove}
        tooltip={t`Remove`}
        analyticsEvent="Dashboard;Remove Card Modal"
      >
        <DashCardActionButton.Icon name="close" />
      </DashCardActionButton>
    </DashCardActionButtonsContainer>
  );
}

export default DashCardActionButtons;

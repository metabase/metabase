/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { getVisualizationRaw } from "metabase/visualizations";

import { isActionCard } from "metabase/writeback/utils";

import AddSeriesButton from "./AddSeriesButton";
import ChartSettingsButton from "./ChartSettingsButton";
import RemoveButton from "./RemoveButton";
import ToggleCardPreviewButton from "./ToggleCardPreviewButton";

import { DashCardActionButtonsContainer } from "./DashCardActionButtons.styled";

const HEADER_ACTION_STYLE = {
  padding: 4,
};

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
      <ToggleCardPreviewButton
        key="toggle-card-preview-button"
        isPreviewing={isPreviewing}
        onPreviewToggle={onPreviewToggle}
      />,
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
        <Tooltip key="click-behavior-tooltip" tooltip={t`Click behavior`}>
          <a
            className="text-dark-hover drag-disabled mr1"
            data-metabase-event="Dashboard;Open Click Behavior Sidebar"
            onClick={showClickBehaviorSidebar}
            style={HEADER_ACTION_STYLE}
          >
            <Icon name="click" />
          </a>
        </Tooltip>,
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
      <Tooltip tooltip={t`Remove`}>
        <RemoveButton className="ml1" onRemove={onRemove} />
      </Tooltip>
    </DashCardActionButtonsContainer>
  );
}

export default DashCardActionButtons;

/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";

import visualizations, { getVisualizationRaw } from "metabase/visualizations";
import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import { isActionCard } from "metabase/writeback/utils";

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

function RemoveButton({ onRemove }) {
  return (
    <a
      className="text-dark-hover drag-disabled"
      data-metabase-event="Dashboard;Remove Card Modal"
      onClick={onRemove}
      style={HEADER_ACTION_STYLE}
    >
      <Icon name="close" size={HEADER_ICON_SIZE} />
    </a>
  );
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

function ToggleCardPreviewButton({ isPreviewing, onPreviewToggle }) {
  return (
    <a
      data-metabase-event="Dashboard;Text;edit"
      className="text-dark-hover cursor-pointer h3 flex-no-shrink relative mr1 drag-disabled"
      onClick={onPreviewToggle}
      style={HEADER_ACTION_STYLE}
    >
      <Tooltip tooltip={isPreviewing ? t`Edit` : t`Preview`}>
        <span className="flex align-center">
          <span className="flex" style={{ width: 18 }}>
            {isPreviewing ? (
              <Icon name="edit_document" size={HEADER_ICON_SIZE} />
            ) : (
              <Icon name="eye" size={18} />
            )}
          </span>
        </span>
      </Tooltip>
    </a>
  );
}

function getSeriesIconName(series) {
  try {
    const display = series[0].card.display;
    return visualizations.get(display === "scalar" ? "bar" : display).iconName;
  } catch (e) {
    return "bar";
  }
}

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
    <span className="flex align-center text-medium" style={{ lineHeight: 1 }}>
      {buttons}
      <Tooltip tooltip={t`Remove`}>
        <RemoveButton className="ml1" onRemove={onRemove} />
      </Tooltip>
    </span>
  );
}

export default DashCardActionButtons;

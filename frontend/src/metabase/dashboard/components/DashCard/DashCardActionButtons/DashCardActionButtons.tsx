import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { getVisualizationRaw } from "metabase/visualizations";
import { isButtonLinkDashCard } from "metabase/writeback/utils";

import {
  Dashboard,
  DashboardOrderedCard,
  VisualizationSettings,
} from "metabase-types/api";
import { Series } from "metabase-types/types/Visualization";

import DashCardActionButton from "./DashCardActionButton";

import AddSeriesButton from "./AddSeriesButton";
import ChartSettingsButton from "./ChartSettingsButton";

import { DashCardActionButtonsContainer } from "./DashCardActionButtons.styled";

interface Props {
  dashCard: DashboardOrderedCard;
  dashboard: Dashboard;
  series: Series;
  isLoading: boolean;
  isVirtualDashCard: boolean;
  isPreviewing: boolean;
  hasError: boolean;
  onRemove: () => void;
  onAddSeries: () => void;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  showClickBehaviorSidebar: () => void;
  onPreviewToggle: () => void;
}

function DashCardActionButtons({
  dashCard,
  dashboard,
  series,
  isLoading,
  isVirtualDashCard,
  isPreviewing,
  hasError,
  onRemove,
  onAddSeries,
  onReplaceAllVisualizationSettings,
  showClickBehaviorSidebar,
  onPreviewToggle,
}: Props) {
  const { disableSettingsConfig, supportPreviewing, supportsSeries } =
    getVisualizationRaw(series).visualization;

  const analyticsContext = dashboard.is_app_page
    ? "Data App Page"
    : "Dashboard";

  const buttons = [];

  if (supportPreviewing) {
    buttons.push(
      <DashCardActionButton
        onClick={onPreviewToggle}
        tooltip={isPreviewing ? t`Edit` : t`Preview`}
        analyticsEvent={`${analyticsContext};Text;edit`}
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

    if (!isVirtualDashCard || isButtonLinkDashCard(dashCard)) {
      buttons.push(
        <DashCardActionButton
          key="click-behavior-tooltip"
          tooltip={t`Click behavior`}
          analyticsEvent={`${analyticsContext};Open Click Behavior Sidebar`}
          onClick={showClickBehaviorSidebar}
        >
          <Icon name="click" />
        </DashCardActionButton>,
      );
    }

    if (supportsSeries) {
      buttons.push(
        <AddSeriesButton
          key="add-series-button"
          series={series}
          analyticsContext={analyticsContext}
          onClick={onAddSeries}
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
        analyticsEvent={`${analyticsContext};Remove Card Modal`}
      >
        <DashCardActionButton.Icon name="close" />
      </DashCardActionButton>
    </DashCardActionButtonsContainer>
  );
}

export default DashCardActionButtons;

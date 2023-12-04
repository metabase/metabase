import { t } from "ttag";

import type { MouseEvent } from "react";
import { useState } from "react";
import { Icon } from "metabase/core/components/Icon";

import { getVisualizationRaw } from "metabase/visualizations";

import type {
  Dashboard,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { isActionDashCard } from "metabase/actions/utils";
import { isLinkDashCard } from "metabase/dashboard/utils";

import { ChartSettingsButton } from "./ChartSettingsButton/ChartSettingsButton";
import { DashCardTabMenu } from "./DashCardTabMenu/DashCardTabMenu";
import { DashCardActionButton } from "./DashCardActionButton/DashCardActionButton";
import { AddSeriesButton } from "./AddSeriesButton/AddSeriesButton";
import { ActionSettingsButtonConnected } from "./ActionSettingsButton/ActionSettingsButton";
import { LinkCardEditButton } from "./LinkCardEditButton/LinkCardEditButton";
import {
  DashCardActionButtonsContainer,
  DashCardActionsPanelContainer,
} from "./DashCardActionsPanel.styled";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: DashboardCard;
  isLoading: boolean;
  isVirtualDashCard: boolean;
  isPreviewing: boolean;
  hasError: boolean;
  onRemove: () => void;
  onAddSeries: () => void;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  onUpdateVisualizationSettings: (
    settings: Partial<VisualizationSettings>,
  ) => void;
  showClickBehaviorSidebar: () => void;
  onPreviewToggle: () => void;
  onLeftEdge: boolean;
  onMouseDown: (event: MouseEvent) => void;
}

export function DashCardActionsPanel({
  series,
  dashboard,
  dashcard,
  isLoading,
  isVirtualDashCard,
  isPreviewing,
  hasError,
  onRemove,
  onAddSeries,
  onReplaceAllVisualizationSettings,
  onUpdateVisualizationSettings,
  showClickBehaviorSidebar,
  onPreviewToggle,
  onLeftEdge,
  onMouseDown,
}: Props) {
  const {
    disableSettingsConfig,
    supportPreviewing,
    supportsSeries,
    disableClickBehavior,
  } = getVisualizationRaw(series) ?? {};

  const [isDashCardTabMenuOpen, setIsDashCardTabMenuOpen] = useState(false);

  const buttons = [];

  if (dashcard) {
    buttons.push(
      <DashCardTabMenu
        key="tabs"
        dashCardId={dashcard.id}
        onClose={() => setIsDashCardTabMenuOpen(false)}
        onOpen={() => setIsDashCardTabMenuOpen(true)}
      />,
    );
  }

  if (supportPreviewing) {
    buttons.push(
      <DashCardActionButton
        key="preview"
        onClick={onPreviewToggle}
        tooltip={isPreviewing ? t`Edit` : t`Preview`}
        aria-label={isPreviewing ? t`Edit card` : t`Preview card`}
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
    if (onReplaceAllVisualizationSettings && !disableSettingsConfig) {
      buttons.push(
        <ChartSettingsButton
          key="chart-settings-button"
          series={series}
          dashboard={dashboard}
          dashcard={dashcard}
          onReplaceAllVisualizationSettings={onReplaceAllVisualizationSettings}
        />,
      );
    }

    if (!isVirtualDashCard && !disableClickBehavior) {
      buttons.push(
        <DashCardActionButton
          key="click-behavior-tooltip"
          aria-label={t`Click behavior`}
          tooltip={t`Click behavior`}
          analyticsEvent="Dashboard;Open Click Behavior Sidebar"
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
          onClick={onAddSeries}
        />,
      );
    }

    if (dashcard && isActionDashCard(dashcard)) {
      buttons.push(
        <ActionSettingsButtonConnected
          key="action-settings-button"
          dashboard={dashboard}
          dashcard={dashcard}
        />,
      );
    }

    if (dashcard && isLinkDashCard(dashcard)) {
      buttons.push(
        <LinkCardEditButton
          key="link-edit-button"
          dashcard={dashcard}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
        />,
      );
    }
  }

  return (
    <DashCardActionsPanelContainer
      data-testid="dashboardcard-actions-panel"
      onMouseDown={onMouseDown}
      isDashCardTabMenuOpen={isDashCardTabMenuOpen}
      onLeftEdge={onLeftEdge}
    >
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
    </DashCardActionsPanelContainer>
  );
}

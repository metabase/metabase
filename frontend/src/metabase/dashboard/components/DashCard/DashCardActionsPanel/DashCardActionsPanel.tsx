import type { MouseEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { isActionDashCard } from "metabase/actions/utils";
import { isLinkDashCard, isVirtualDashCard } from "metabase/dashboard/utils";
import { Icon } from "metabase/ui";
import { getVisualizationRaw } from "metabase/visualizations";
import type {
  Dashboard,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { ActionSettingsButtonConnected } from "./ActionSettingsButton/ActionSettingsButton";
import { AddSeriesButton } from "./AddSeriesButton/AddSeriesButton";
import { ChartSettingsButton } from "./ChartSettingsButton/ChartSettingsButton";
import { DashCardActionButton } from "./DashCardActionButton/DashCardActionButton";
import {
  DashCardActionButtonsContainer,
  DashCardActionsPanelContainer,
} from "./DashCardActionsPanel.styled";
import { DashCardTabMenu } from "./DashCardTabMenu/DashCardTabMenu";
import { LinkCardEditButton } from "./LinkCardEditButton/LinkCardEditButton";
import { useDuplicateDashCard } from "./use-duplicate-dashcard";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: DashboardCard;
  isLoading: boolean;
  isPreviewing: boolean;
  hasError: boolean;
  onRemove: () => void;
  onAddSeries: () => void;
  onReplaceCard: () => void;
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
  isPreviewing,
  hasError,
  onRemove,
  onAddSeries,
  onReplaceCard,
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

  const buttons = [];

  const [isDashCardTabMenuOpen, setIsDashCardTabMenuOpen] = useState(false);

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

    if (dashcard && !isVirtualDashCard(dashcard) && !disableClickBehavior) {
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
  }

  if (!isLoading && dashcard && !isVirtualDashCard(dashcard)) {
    buttons.push(
      <DashCardActionButton
        key="replace-question"
        aria-label={t`Replace`}
        tooltip={t`Replace`}
        onClick={onReplaceCard}
      >
        <Icon name="refresh_downstream" />
      </DashCardActionButton>,
    );
  }

  const duplicateDashcard = useDuplicateDashCard({ dashboard, dashcard });
  if (!isLoading && dashcard) {
    buttons.push(
      <DashCardActionButton
        key="duplicate-question"
        aria-label={t`Duplicate`}
        tooltip={t`Duplicate`}
        onClick={duplicateDashcard}
      >
        <Icon name="copy" />
      </DashCardActionButton>,
    );
  }

  if (!isLoading && !hasError) {
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

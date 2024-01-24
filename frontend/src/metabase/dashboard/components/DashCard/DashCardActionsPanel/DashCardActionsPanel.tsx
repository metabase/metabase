import { t } from "ttag";

import type { MouseEvent } from "react";
import { useState } from "react";
import { Icon } from "metabase/ui";

import { getVisualizationRaw } from "metabase/visualizations";

import type {
  Dashboard,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { isActionDashCard } from "metabase/actions/utils";
import { isLinkDashCard, isVirtualDashCard } from "metabase/dashboard/utils";

import { createAction, useDispatch, useSelector } from "metabase/lib/redux";
import {
  FETCH_CARD_DATA,
  addDashCardToDashboard,
  generateTemporaryDashcardId,
} from "metabase/dashboard/actions";
import {
  getCardData,
  getDashboards,
  getDashcards,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
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

  const dispatch = useDispatch();
  const dashboards = useSelector(getDashboards);
  const dashcards = useSelector(getDashcards);
  const selectedTabId = useSelector(getSelectedTabId);
  const dashcardDataMap = useSelector(getCardData);

  if (!isLoading && dashcard) {
    buttons.push(
      <DashCardActionButton
        key="duplicate-question"
        aria-label={t`Duplicate`}
        tooltip={t`Duplicate`}
        onClick={() => {
          const newId = generateTemporaryDashcardId(); // TODO maybe do this in a better way :thinking:
          const { id: _id, ...newDashcard } = dashcard;
          const position = getPositionForNewDashCard(
            getExistingDashCards(
              dashboards,
              dashcards,
              dashboard.id,
              selectedTabId,
            ),
            dashcard.size_x,
            dashcard.size_y,
          );
          dispatch(
            addDashCardToDashboard({
              dashId: dashboard.id,
              dashcardOverrides: { id: newId, ...newDashcard, ...position },
              tabId: selectedTabId,
            }),
          );

          if (!isVirtualDashCard(dashcard) && dashcard.card_id !== null) {
            dispatch(
              createAction(FETCH_CARD_DATA)({
                // TODO do this in a better way maybe (e.g. don't manually create action)?
                dashcard_id: newId,
                card_id: dashcard.card_id,
                result: dashcardDataMap[dashcard.id][dashcard?.card_id],
              }),
            );
          }
        }}
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

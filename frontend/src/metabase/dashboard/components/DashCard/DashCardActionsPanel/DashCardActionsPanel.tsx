import type { MouseEvent } from "react";
import { memo, useCallback, useState } from "react";
import { t } from "ttag";

import { isActionDashCard } from "metabase/actions/utils";
import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import { isLinkDashCard, isVirtualDashCard } from "metabase/dashboard/utils";
import { useModal } from "metabase/hooks/use-modal";
import { Icon } from "metabase/ui";
import { getVisualizationRaw } from "metabase/visualizations";
import type {
  DashCardId,
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
  onRemove: (dashcard: DashboardCard) => void;
  onAddSeries: (dashcard: DashboardCard) => void;
  onReplaceCard: (dashcard: DashboardCard) => void;
  onReplaceAllDashCardVisualizationSettings: (
    dashcardId: DashCardId,
    settings: VisualizationSettings,
  ) => void;
  onUpdateVisualizationSettings: (
    dashcardId: DashCardId,
    settings: Partial<VisualizationSettings>,
  ) => void;
  showClickBehaviorSidebar: () => void;
  onPreviewToggle: () => void;
  onLeftEdge: boolean;
  onMouseDown: (event: MouseEvent) => void;
}

function DashCardActionsPanelInner({
  series,
  dashboard,
  dashcard,
  isLoading,
  isPreviewing,
  hasError,
  onRemove,
  onAddSeries,
  onReplaceCard,
  onReplaceAllDashCardVisualizationSettings,
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

  const isDashboardCard = typeof dashcard?.card.dashboard_id === "number";

  const buttons = [];

  const [isDashCardTabMenuOpen, setIsDashCardTabMenuOpen] = useState(false);

  const deleteConfirmationModal = useModal(false);

  const handleOnUpdateVisualizationSettings = useCallback(
    (settings: VisualizationSettings) => {
      if (!dashcard) {
        return;
      }

      onUpdateVisualizationSettings(dashcard.id, settings);
    },
    [dashcard, onUpdateVisualizationSettings],
  );

  const handleOnReplaceAllVisualizationSettings = useCallback(
    (settings: VisualizationSettings) => {
      if (!dashcard) {
        return;
      }

      onReplaceAllDashCardVisualizationSettings(dashcard.id, settings);
    },
    [dashcard, onReplaceAllDashCardVisualizationSettings],
  );

  const handleReplaceCard = useCallback(() => {
    if (!dashcard) {
      return;
    }

    onReplaceCard(dashcard);
  }, [dashcard, onReplaceCard]);

  const handleAddSeries = useCallback(() => {
    if (!dashcard) {
      return;
    }

    onAddSeries(dashcard);
  }, [dashcard, onAddSeries]);

  const handleRemoveCard = useCallback(() => {
    if (!dashcard) {
      return;
    }

    if (isDashboardCard) {
      deleteConfirmationModal.open();
    } else {
      onRemove(dashcard);
    }
  }, [dashcard, onRemove, isDashboardCard, deleteConfirmationModal]);

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

  if (supportPreviewing && isPreviewing) {
    buttons.push(
      <DashCardActionButton
        key="preview"
        onClick={onPreviewToggle}
        tooltip={t`Edit`}
        aria-label={t`Edit card`}
      >
        {isPreviewing ? <DashCardActionButton.Icon name="pencil" /> : null}
      </DashCardActionButton>,
    );
  }

  if (!isLoading && !hasError) {
    if (!disableSettingsConfig) {
      buttons.push(
        <ChartSettingsButton
          key="chart-settings-button"
          series={series}
          dashboard={dashboard}
          dashcard={dashcard}
          onReplaceAllVisualizationSettings={
            handleOnReplaceAllVisualizationSettings
          }
        />,
      );
    }

    if (dashcard && !isVirtualDashCard(dashcard) && !disableClickBehavior) {
      buttons.push(
        <DashCardActionButton
          key="click-behavior-tooltip"
          aria-label={t`Click behavior`}
          tooltip={t`Click behavior`}
          onClick={showClickBehaviorSidebar}
        >
          <Icon name="click" />
        </DashCardActionButton>,
      );
    }
  }

  if (
    !isLoading &&
    dashcard &&
    !isVirtualDashCard(dashcard) &&
    !isDashboardCard
  ) {
    buttons.push(
      <DashCardActionButton
        key="replace-question"
        aria-label={t`Replace`}
        tooltip={t`Replace`}
        onClick={handleReplaceCard}
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
          onClick={handleAddSeries}
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
          onUpdateVisualizationSettings={handleOnUpdateVisualizationSettings}
        />,
      );
    }
  }

  return (
    <>
      <DashCardActionsPanelContainer
        data-testid="dashboardcard-actions-panel"
        onMouseDown={onMouseDown}
        isDashCardTabMenuOpen={isDashCardTabMenuOpen}
        onLeftEdge={onLeftEdge}
      >
        <DashCardActionButtonsContainer>
          {buttons}
          <DashCardActionButton onClick={handleRemoveCard} tooltip={t`Remove`}>
            <DashCardActionButton.Icon name="close" />
          </DashCardActionButton>
        </DashCardActionButtonsContainer>
      </DashCardActionsPanelContainer>
      {isDashboardCard && (
        <Modal
          isOpen={isDashboardCard && deleteConfirmationModal.opened}
          onClose={deleteConfirmationModal.close}
          trapFocus
        >
          <ConfirmContent
            title={t`Are you sure you want to remove this question?`}
            message={
              <>
                {t`If you do this, this question won’t be available anymore.`}
                <br />
                {t`You can undo this action by going into the Dashboard Info → History.`}
              </>
            }
            cancelButtonText={t`Cancel`}
            confirmButtonText={t`Remove question`}
            data-testid="remove-confirmation"
            onAction={() => onRemove(dashcard)}
            onCancel={deleteConfirmationModal.close}
            onClose={deleteConfirmationModal.close}
          />
        </Modal>
      )}
    </>
  );
}

export const DashCardActionsPanel = memo(DashCardActionsPanelInner);

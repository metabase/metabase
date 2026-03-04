import cx from "classnames";
import type { MouseEvent } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { isActionDashCard } from "metabase/actions/utils";
import { AddFilterParameterMenu } from "metabase/dashboard/components/AddFilterParameterMenu";
import {
  isHeadingDashCard,
  isLinkDashCard,
  isQuestionDashCard,
  isVirtualDashCard,
  supportsInlineParameters,
} from "metabase/dashboard/utils";
import { trackSimpleEvent } from "metabase/lib/analytics";
import type { NewParameterOpts } from "metabase/parameters/utils/dashboards";
import { Box, Icon } from "metabase/ui";
import { getVisualizationRaw } from "metabase/visualizations";
import {
  isDisabledForVisualizer,
  isVisualizerDashboardCard,
  isVisualizerSupportedVisualization,
} from "metabase/visualizer/utils";
import type Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { canEditQuestion } from "../DashCardMenu/utils";

import { ActionSettingsButtonConnected } from "./ActionSettingsButton/ActionSettingsButton";
import { ChartSettingsButton } from "./ChartSettingsButton/ChartSettingsButton";
import { DashCardActionButton } from "./DashCardActionButton/DashCardActionButton";
import S from "./DashCardActionsPanel.module.css";
import { DashCardTabMenu } from "./DashCardTabMenu/DashCardTabMenu";
import { LinkCardEditButton } from "./LinkCardEditButton/LinkCardEditButton";

interface Props {
  series: Series;
  dashcard?: DashboardCard;
  question: Question | null;
  isLoading: boolean;
  isPreviewing: boolean;
  hasError: boolean;
  isTrashedOnRemove: boolean;
  onDuplicate: () => void;
  onRemove: (dashcard: DashboardCard) => void;
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
  className?: string;
  onAddParameter: (options: NewParameterOpts) => void;
  onEditVisualization?: () => void;
}

function DashCardActionsPanelInner({
  series,
  dashcard,
  question,
  isLoading,
  isPreviewing,
  hasError,
  isTrashedOnRemove,
  onDuplicate,
  onRemove,
  onReplaceCard,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateVisualizationSettings,
  showClickBehaviorSidebar,
  onPreviewToggle,
  onLeftEdge,
  onMouseDown,
  className,
  onAddParameter,
  onEditVisualization,
}: Props) {
  const { disableSettingsConfig, supportPreviewing, disableClickBehavior } =
    getVisualizationRaw(series) ?? {};

  const buttons = [];

  const [isDashCardTabMenuOpen, setIsDashCardTabMenuOpen] = useState(false);

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

  const handleRemoveCard = useCallback(() => {
    if (!dashcard) {
      return;
    }

    onRemove(dashcard);
  }, [dashcard, onRemove]);

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

  const canAddFilter = useMemo(() => {
    if (!dashcard || !supportsInlineParameters(dashcard)) {
      return false;
    }

    return isQuestionDashCard(dashcard)
      ? question != null && canEditQuestion(question)
      : isHeadingDashCard(dashcard);
  }, [dashcard, question]);

  if (canAddFilter) {
    buttons.push(
      <AddFilterParameterMenu key="add-filter" onAdd={onAddParameter}>
        <DashCardActionButton
          tooltip={t`Add a filter`}
          aria-label={t`Add a filter`}
        >
          <DashCardActionButton.Icon name="filter" />
        </DashCardActionButton>
      </AddFilterParameterMenu>,
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
    if (
      isVisualizerDashboardCard(dashcard) ||
      isVisualizerSupportedVisualization(dashcard?.card.display)
    ) {
      const label = isVisualizerDashboardCard(dashcard)
        ? t`Edit visualization`
        : t`Visualize another way`;

      buttons.push(
        <DashCardActionButton
          key="visualizer-button"
          tooltip={label}
          aria-label={label}
          onClick={onEditVisualization}
        >
          <DashCardActionButton.Icon name="lineandbar" />
        </DashCardActionButton>,
      );
    }

    if (
      !disableSettingsConfig &&
      !isVisualizerDashboardCard(dashcard) &&
      !isVisualizerSupportedVisualization(dashcard?.card.display)
    ) {
      buttons.push(
        <ChartSettingsButton
          key="chart-settings-button"
          series={series}
          dashcard={dashcard}
          onReplaceAllVisualizationSettings={
            handleOnReplaceAllVisualizationSettings
          }
        />,
      );
    }

    if (
      dashcard &&
      !isVisualizerDashboardCard(dashcard) &&
      !isVisualizerSupportedVisualization(dashcard?.card.display) &&
      !isVirtualDashCard(dashcard) &&
      !isDisabledForVisualizer(dashcard?.card.display) &&
      onEditVisualization
    ) {
      buttons.push(
        <DashCardActionButton
          key="visualizer-button"
          tooltip={t`Visualize another way`}
          aria-label={t`Visualize another way`}
          onClick={() => {
            trackSimpleEvent({
              event: "visualize_another_way_clicked",
              triggered_from: "dashcard-actions-panel",
            });
            onEditVisualization();
          }}
        >
          <DashCardActionButton.Icon name="lineandbar" />
        </DashCardActionButton>,
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

  if (!isLoading && dashcard && !isVirtualDashCard(dashcard)) {
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

  if (!isLoading && dashcard) {
    buttons.push(
      <DashCardActionButton
        key="duplicate-question"
        aria-label={t`Duplicate`}
        tooltip={t`Duplicate`}
        onClick={onDuplicate}
      >
        <Icon name="copy" />
      </DashCardActionButton>,
    );
  }

  if (!isLoading && !hasError) {
    if (dashcard && isActionDashCard(dashcard)) {
      buttons.push(
        <ActionSettingsButtonConnected
          key="action-settings-button"
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

  if (isTrashedOnRemove) {
    buttons.push(
      <DashCardActionButton
        onClick={handleRemoveCard}
        tooltip={t`Remove and trash`}
        key="remove"
      >
        <DashCardActionButton.Icon name="trash" />
      </DashCardActionButton>,
    );
  } else {
    buttons.push(
      <DashCardActionButton
        onClick={handleRemoveCard}
        tooltip={t`Remove`}
        key="remove"
      >
        <DashCardActionButton.Icon name="close" />
      </DashCardActionButton>,
    );
  }

  return (
    <Box
      className={cx(
        S.DashCardActionsPanelContainer,
        {
          [S.isDashCardTabMenuOpen]: isDashCardTabMenuOpen,
          [S.onLeftEdge]: onLeftEdge,
        },
        className,
      )}
      pos="absolute"
      top={0}
      right="20px"
      data-testid="dashboardcard-actions-panel"
      data-dontdrag // allows to interact with the actions panel while in the edit mode
      onMouseDown={onMouseDown}
    >
      <Box className={S.DashCardActionButtonsContainer} component="span">
        {buttons}
      </Box>
    </Box>
  );
}

export const DashCardActionsPanel = memo(DashCardActionsPanelInner);

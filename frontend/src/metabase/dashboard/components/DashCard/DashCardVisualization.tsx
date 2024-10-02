import cx from "classnames";
import type { LocationDescriptor } from "history";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useClickBehaviorData } from "metabase/dashboard/hooks";
import {
  getVirtualCardType,
  isQuestionCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import { useSelector } from "metabase/lib/redux";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconName, IconProps } from "metabase/ui";
import { getVisualizationRaw } from "metabase/visualizations";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import Visualization from "metabase/visualizations/components/Visualization";
import type { QueryClickActionsMode } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  Dashboard,
  DashboardCard,
  Dataset,
  Series,
  VirtualCardDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import { ClickBehaviorSidebarOverlay } from "./ClickBehaviorSidebarOverlay/ClickBehaviorSidebarOverlay";
import {
  VirtualDashCardOverlayRoot,
  VirtualDashCardOverlayText,
} from "./DashCard.styled";
import { DashCardMenu } from "./DashCardMenu/DashCardMenu";
import { DashCardParameterMapper } from "./DashCardParameterMapper/DashCardParameterMapper";
import type {
  CardSlownessStatus,
  DashCardOnChangeCardAndRunHandler,
} from "./types";
import { shouldShowParameterMapper } from "./utils";

interface DashCardVisualizationProps {
  dashboard: Dashboard;
  dashcard: DashboardCard;
  series: Series;
  mode?: QueryClickActionsMode | Mode;
  getHref?: () => string | undefined;

  gridSize: {
    width: number;
    height: number;
  };
  gridItemWidth: number;
  totalNumGridCols: number;

  expectedDuration: number;
  isSlow: CardSlownessStatus;

  isAction: boolean;
  isPreviewing: boolean;
  isEmbed: boolean;
  isClickBehaviorSidebarOpen: boolean;
  isEditingDashCardClickBehavior: boolean;
  isEditingDashboardLayout: boolean;
  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isNightMode?: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isXray?: boolean;
  withTitle?: boolean;

  error?: { message?: string; icon?: IconName };
  headerIcon?: IconProps;

  onUpdateVisualizationSettings: (
    id: DashCardId,
    settings: VisualizationSettings,
  ) => void;
  onChangeCardAndRun: DashCardOnChangeCardAndRunHandler | null;
  showClickBehaviorSidebar: (dashCardId: DashCardId | null) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
  onTogglePreviewing: () => void;

  downloadsEnabled: boolean;
}

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.

export function DashCardVisualization({
  dashcard,
  dashboard,
  series,
  mode,
  getHref,
  gridSize,
  gridItemWidth,
  totalNumGridCols,
  expectedDuration,
  error,
  headerIcon,
  isAction,
  isSlow,
  isPreviewing,
  isEmbed,
  isPublicOrEmbedded,
  isXray,
  isEditingDashboardLayout,
  isClickBehaviorSidebarOpen,
  isEditingDashCardClickBehavior,
  isEditing = false,
  isNightMode = false,
  isFullscreen = false,
  isMobile = false,
  isEditingParameter,
  withTitle = true,
  onChangeCardAndRun,
  onTogglePreviewing,
  showClickBehaviorSidebar,
  onChangeLocation,
  onUpdateVisualizationSettings,
  downloadsEnabled,
}: DashCardVisualizationProps) {
  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return isQuestionCard(dashcard.card)
      ? new Question(dashcard.card, metadata)
      : null;
  }, [dashcard.card, metadata]);

  const handleOnUpdateVisualizationSettings = useCallback(
    (settings: VisualizationSettings) => {
      onUpdateVisualizationSettings(dashcard.id, settings);
    },
    [dashcard.id, onUpdateVisualizationSettings],
  );

  const visualizationOverlay = useMemo(() => {
    if (isClickBehaviorSidebarOpen) {
      const disableClickBehavior =
        getVisualizationRaw(series)?.disableClickBehavior;
      if (isVirtualDashCard(dashcard) || disableClickBehavior) {
        const virtualDashcardType = getVirtualCardType(
          dashcard,
        ) as VirtualCardDisplay;
        const placeholderText =
          {
            link: t`Link`,
            action: t`Action Button`,
            text: t`Text Card`,
            heading: t`Heading Card`,
            placeholder: t`Placeholder Card`,
            iframe: t`iFrame Card`,
          }[virtualDashcardType] ??
          t`This card does not support click mappings`;

        return (
          <VirtualDashCardOverlayRoot>
            <VirtualDashCardOverlayText>
              {placeholderText}
            </VirtualDashCardOverlayText>
          </VirtualDashCardOverlayRoot>
        );
      }
      return (
        <ClickBehaviorSidebarOverlay
          dashcard={dashcard}
          dashcardWidth={gridItemWidth}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          isShowingThisClickBehaviorSidebar={isEditingDashCardClickBehavior}
        />
      );
    }

    if (shouldShowParameterMapper({ dashcard, isEditingParameter })) {
      return (
        <DashCardParameterMapper dashcard={dashcard} isMobile={isMobile} />
      );
    }

    return null;
  }, [
    dashcard,
    gridItemWidth,
    isMobile,
    isEditingParameter,
    isClickBehaviorSidebarOpen,
    isEditingDashCardClickBehavior,
    showClickBehaviorSidebar,
    series,
  ]);

  const actionButtons = useMemo(() => {
    if (!question) {
      return null;
    }

    const mainSeries = series[0] as unknown as Dataset;
    const shouldShowDashCardMenu = DashCardMenu.shouldRender({
      question,
      result: mainSeries,
      isXray,
      isPublicOrEmbedded,
      isEditing,
      downloadsEnabled,
    });

    if (!shouldShowDashCardMenu) {
      return null;
    }

    return (
      <DashCardMenu
        downloadsEnabled={downloadsEnabled}
        question={question}
        result={mainSeries}
        dashcardId={dashcard.id}
        dashboardId={dashboard.id}
        token={
          isJWT(dashcard.dashboard_id)
            ? String(dashcard.dashboard_id)
            : undefined
        }
        uuid={isUuid(dashcard.dashboard_id) ? dashcard.dashboard_id : undefined}
      />
    );
  }, [
    question,
    series,
    isXray,
    isPublicOrEmbedded,
    isEditing,
    dashcard.id,
    dashcard.dashboard_id,
    dashboard.id,
    downloadsEnabled,
  ]);

  const { getExtraDataForClick } = useClickBehaviorData({
    dashcardId: dashcard.id,
  });

  return (
    <Visualization
      className={cx(CS.flexFull, {
        [CS.pointerEventsNone]: isEditingDashboardLayout,
        [CS.overflowAuto]: visualizationOverlay,
        [CS.overflowHidden]: !visualizationOverlay,
      })}
      classNameWidgets={cx({
        [cx(CS.textLight, CS.textMediumHover)]: isEmbed,
      })}
      dashboard={dashboard}
      dashcard={dashcard}
      rawSeries={series}
      metadata={metadata}
      mode={mode}
      getHref={getHref}
      gridSize={gridSize}
      totalNumGridCols={totalNumGridCols}
      headerIcon={headerIcon}
      expectedDuration={expectedDuration}
      error={error?.message}
      errorIcon={error?.icon}
      showTitle={withTitle}
      canToggleSeriesVisibility={!isEditing}
      isAction={isAction}
      isDashboard
      isSlow={isSlow}
      isFullscreen={isFullscreen}
      isNightMode={isNightMode}
      isEditing={isEditing}
      isPreviewing={isPreviewing}
      isEditingParameter={isEditingParameter}
      isMobile={isMobile}
      actionButtons={actionButtons}
      replacementContent={visualizationOverlay}
      getExtraDataForClick={getExtraDataForClick}
      onUpdateVisualizationSettings={handleOnUpdateVisualizationSettings}
      onTogglePreviewing={onTogglePreviewing}
      onChangeCardAndRun={onChangeCardAndRun}
      onChangeLocation={onChangeLocation}
    />
  );
}

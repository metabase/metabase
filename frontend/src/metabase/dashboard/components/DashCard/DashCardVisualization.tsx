import cx from "classnames";
import type { LocationDescriptor } from "history";
import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { WithVizSettingsData } from "metabase/dashboard/hoc/WithVizSettingsData";
import {
  getVirtualCardType,
  isQuestionCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import type { IconName, IconProps } from "metabase/ui";
import { getVisualizationRaw } from "metabase/visualizations";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import Visualization from "metabase/visualizations/components/Visualization";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Dashboard,
  DashCardId,
  Dataset,
  Series,
  ParameterId,
  ParameterValueOrArray,
  VirtualCardDisplay,
  VisualizationSettings,
  DashboardCard,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { ClickBehaviorSidebarOverlay } from "./ClickBehaviorSidebarOverlay/ClickBehaviorSidebarOverlay";
import {
  VirtualDashCardOverlayRoot,
  VirtualDashCardOverlayText,
} from "./DashCard.styled";
import { DashCardMenuConnected } from "./DashCardMenu/DashCardMenu";
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
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  parameterValuesBySlug: Record<string, ParameterValueOrArray>;
  metadata: Metadata;
  mode?: Mode;

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
  isPublic?: boolean;
  isXray?: boolean;

  error?: { message?: string; icon?: IconName };
  headerIcon?: IconProps;

  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  onChangeCardAndRun: DashCardOnChangeCardAndRunHandler | null;
  showClickBehaviorSidebar: (dashCardId: DashCardId | null) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

function mapDispatchToProps(dispatch: Dispatch) {
  return { dispatch };
}

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.
const WrappedVisualization = WithVizSettingsData(
  connect(null, mapDispatchToProps)(Visualization),
);

export function DashCardVisualization({
  dashcard,
  dashboard,
  series,
  parameterValues,
  parameterValuesBySlug,
  mode,
  metadata,
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
  isPublic,
  isXray,
  isEditingDashboardLayout,
  isClickBehaviorSidebarOpen,
  isEditingDashCardClickBehavior,
  isEditing = false,
  isNightMode = false,
  isFullscreen = false,
  isMobile = false,
  isEditingParameter,
  onChangeCardAndRun,
  showClickBehaviorSidebar,
  onChangeLocation,
  onUpdateVisualizationSettings,
}: DashCardVisualizationProps) {
  const question = useMemo(() => {
    return isQuestionCard(dashcard.card)
      ? new Question(dashcard.card, metadata)
      : null;
  }, [dashcard.card, metadata]);

  const renderVisualizationOverlay = useCallback(() => {
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

  const renderActionButtons = useCallback(() => {
    if (!question) {
      return null;
    }

    const mainSeries = series[0] as unknown as Dataset;
    const shouldShowDashCardMenu = DashCardMenuConnected.shouldRender({
      question,
      result: mainSeries,
      isXray,
      isEmbed,
      isPublic,
      isEditing,
    });

    if (!shouldShowDashCardMenu) {
      return null;
    }

    return (
      <DashCardMenuConnected
        question={question}
        result={mainSeries}
        dashcardId={dashcard.id}
        dashboardId={dashboard.id}
        token={isEmbed ? String(dashcard.dashboard_id) : undefined}
        params={parameterValuesBySlug}
      />
    );
  }, [
    question,
    dashcard.id,
    dashcard.dashboard_id,
    series,
    isEmbed,
    isPublic,
    isEditing,
    isXray,
    dashboard.id,
    parameterValuesBySlug,
  ]);

  return (
    <WrappedVisualization
      className={cx(CS.flexFull, CS.overflowHidden, {
        "pointer-events-none": isEditingDashboardLayout,
      })}
      classNameWidgets={cx({
        "text-light text-medium-hover": isEmbed,
      })}
      dashboard={dashboard}
      dashcard={dashcard}
      rawSeries={series}
      parameterValues={parameterValues}
      parameterValuesBySlug={parameterValuesBySlug}
      metadata={metadata}
      mode={mode}
      gridSize={gridSize}
      totalNumGridCols={totalNumGridCols}
      headerIcon={headerIcon}
      expectedDuration={expectedDuration}
      error={error?.message}
      errorIcon={error?.icon}
      showTitle
      isAction={isAction}
      isDashboard
      isSlow={isSlow}
      isFullscreen={isFullscreen}
      isNightMode={isNightMode}
      isEditing={isEditing}
      isPreviewing={isPreviewing}
      isEditingParameter={isEditingParameter}
      isMobile={isMobile}
      actionButtons={renderActionButtons()}
      replacementContent={renderVisualizationOverlay()}
      onUpdateVisualizationSettings={onUpdateVisualizationSettings}
      onChangeCardAndRun={onChangeCardAndRun}
      onChangeLocation={onChangeLocation}
    />
  );
}

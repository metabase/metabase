import React, { useCallback } from "react";
import cx from "classnames";
import { t } from "ttag";
import { connect } from "react-redux";
import type { LocationDescriptor } from "history";

import { IconProps } from "metabase/core/components/Icon";

import Visualization from "metabase/visualizations/components/Visualization";
import WithVizSettingsData from "metabase/dashboard/hoc/WithVizSettingsData";
import { getVisualizationRaw } from "metabase/visualizations";

import {
  getVirtualCardType,
  isVirtualDashCard,
} from "metabase/dashboard/utils";

import type {
  Dashboard,
  DashboardOrderedCard,
  DashCardId,
  Dataset,
  Series,
  ParameterId,
  ParameterValueOrArray,
  VirtualCardDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import Question from "metabase-lib/Question";
import type Mode from "metabase-lib/Mode";
import type Metadata from "metabase-lib/metadata/Metadata";

import { CardSlownessStatus, DashCardOnChangeCardAndRunHandler } from "./types";
import ClickBehaviorSidebarOverlay from "./ClickBehaviorSidebarOverlay";
import DashCardMenu from "./DashCardMenu";
import DashCardParameterMapper from "./DashCardParameterMapper";
import {
  VirtualDashCardOverlayRoot,
  VirtualDashCardOverlayText,
} from "./DashCard.styled";

interface DashCardVisualizationProps {
  dashboard: Dashboard;
  dashcard: DashboardOrderedCard;
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

  error?: { message?: string; icon?: IconProps["name"] };
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

function DashCardVisualization({
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
  isAction,
  headerIcon,
  isSlow,
  isPreviewing,
  isEmbed,
  isPublic,
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
  const renderVisualizationOverlay = useCallback(() => {
    if (isClickBehaviorSidebarOpen) {
      const { disableClickBehavior } =
        getVisualizationRaw(series).visualization;
      if (isVirtualDashCard(dashcard) || disableClickBehavior) {
        const virtualDashcardType = getVirtualCardType(
          dashcard,
        ) as VirtualCardDisplay;
        const placeholderText =
          {
            link: t`Link`,
            action: t`Action Button`,
            text: t`Text Card`,
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

    if (isEditingParameter) {
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
    const question = new Question(dashcard.card, metadata);
    const mainSeries = series[0] as unknown as Dataset;

    const shouldShowDownloadWidget =
      isEmbed ||
      (!isPublic &&
        !isEditing &&
        DashCardMenu.shouldRender({ question, result: mainSeries }));

    if (!shouldShowDownloadWidget) {
      return null;
    }

    return (
      <DashCardMenu
        question={question}
        result={mainSeries}
        dashcardId={dashcard.id}
        dashboardId={dashboard.id}
        token={isEmbed ? String(dashcard.dashboard_id) : undefined}
        params={parameterValuesBySlug}
      />
    );
  }, [
    series,
    metadata,
    isEmbed,
    isPublic,
    isEditing,
    dashcard,
    parameterValuesBySlug,
    dashboard,
  ]);

  return (
    <WrappedVisualization
      // Visualization has to be converted to TypeScript before we can remove the ts-ignore
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      className={cx("flex-full overflow-hidden", {
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
      isDashboard
      isAction={isAction}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashCardVisualization;

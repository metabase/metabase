import React, { useCallback } from "react";
import cx from "classnames";
import { t } from "ttag";
import { connect } from "react-redux";
import type { LocationDescriptor } from "history";

import { IconProps } from "metabase/components/Icon";

import Visualization from "metabase/visualizations/components/Visualization";
import WithVizSettingsData from "metabase/visualizations/hoc/WithVizSettingsData";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";

import { isVirtualDashCard } from "metabase/dashboard/utils";

import type {
  Dashboard,
  DashboardOrderedCard,
  DashCardId,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";
import type { Series } from "metabase-types/types/Visualization";
import type { Dispatch } from "metabase-types/store";

import type Mode from "metabase-lib/Mode";
import type Metadata from "metabase-lib/metadata/Metadata";

import { CardSlownessStatus, DashCardOnChangeCardAndRunHandler } from "./types";
import ClickBehaviorSidebarOverlay from "./ClickBehaviorSidebarOverlay";
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
      if (isVirtualDashCard(dashcard)) {
        const isTextCard =
          dashcard?.visualization_settings?.virtual_card?.display === "text";
        return (
          <VirtualDashCardOverlayRoot>
            <VirtualDashCardOverlayText>
              {isTextCard ? t`Text card` : t`Action button`}
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
  ]);

  const renderActionButtons = useCallback(() => {
    if (isEmbed) {
      return (
        <QueryDownloadWidget
          className="m1 text-brand-hover text-light"
          classNameClose="hover-child"
          card={dashcard.card}
          params={parameterValuesBySlug}
          dashcardId={dashcard.id}
          token={dashcard.dashboard_id}
          icon="download"
          // Can be removed once QueryDownloadWidget is converted to Typescript
          visualizationSettings={undefined}
        />
      );
    }
    return null;
  }, [dashcard, parameterValuesBySlug, isEmbed]);

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

export default DashCardVisualization;

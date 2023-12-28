import { useCallback, useMemo } from "react";
import cx from "classnames";
import { t } from "ttag";
import { connect } from "react-redux";
import type { LocationDescriptor } from "history";

import type { IconName, IconProps } from "metabase/core/components/Icon";

import Visualization from "metabase/visualizations/components/Visualization";
import { WithVizSettingsData } from "metabase/dashboard/hoc/WithVizSettingsData";
import { getVisualizationRaw } from "metabase/visualizations";

import {
  getVirtualCardType,
  isVirtualDashCard,
} from "metabase/dashboard/utils";

import type {
  Dashboard,
  DashboardCard,
  DashCardId,
  Dataset,
  Series,
  ParameterId,
  ParameterValueOrArray,
  VirtualCardDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import type { Mode } from "metabase/visualizations/click-actions/Mode";
import Question from "metabase-lib/Question";
import type Metadata from "metabase-lib/metadata/Metadata";

import type {
  CardSlownessStatus,
  DashCardOnChangeCardAndRunHandler,
} from "./types";
import { ClickBehaviorSidebarOverlay } from "./ClickBehaviorSidebarOverlay/ClickBehaviorSidebarOverlay";
import { DashCardMenuConnected } from "./DashCardMenu/DashCardMenu";
import { DashCardParameterMapper } from "./DashCardParameterMapper/DashCardParameterMapper";
import {
  VirtualDashCardOverlayRoot,
  VirtualDashCardOverlayText,
} from "./DashCard.styled";
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
    return new Question(dashcard.card, metadata);
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

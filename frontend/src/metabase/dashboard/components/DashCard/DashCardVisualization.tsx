import cx from "classnames";
import type { LocationDescriptor } from "history";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { replaceCardWithVisualization } from "metabase/dashboard/actions";
import { useClickBehaviorData } from "metabase/dashboard/hooks";
import { getDashcardData } from "metabase/dashboard/selectors";
import {
  getVirtualCardType,
  isQuestionCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { getMetadata } from "metabase/selectors/metadata";
import type { IconName, IconProps } from "metabase/ui";
import { getVisualizationRaw } from "metabase/visualizations";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import Visualization from "metabase/visualizations/components/Visualization";
import type { QueryClickActionsMode } from "metabase/visualizations/types";
import { VisualizerModal } from "metabase/visualizer/components/VisualizerModal";
import {
  extractReferencedColumns,
  getDataSourceIdFromNameRef,
  isDataSourceNameRef,
  isVisualizerDashboardCard,
  parseDataSourceId,
} from "metabase/visualizer/utils";
import Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  Dashboard,
  DashboardCard,
  Dataset,
  RowValues,
  Series,
  VirtualCardDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

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
  editDashboard: () => void;
}

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.

export function DashCardVisualization({
  dashcard,
  dashboard,
  series: _series,
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
  editDashboard,
}: DashCardVisualizationProps) {
  const datasets = useSelector(state => getDashcardData(state, dashcard.id));
  const [isVisualizerModalOpen, setIsVisualizerModalOpen] = useState(false);

  const dispatch = useDispatch();

  const editVisualization = useMemo(() => {
    if (isVisualizerDashboardCard(dashcard)) {
      return () => {
        setIsVisualizerModalOpen(true);
        editDashboard();
      };
    }
  }, [editDashboard, dashcard]);

  const onVisualizerModalSave = useCallback(
    (visualization: VisualizerHistoryItem) => {
      dispatch(
        replaceCardWithVisualization({
          dashcardId: dashcard.id,
          visualization,
        }),
      );
      setIsVisualizerModalOpen(false);
    },
    [dashcard.id, dispatch],
  );

  const onVisualizerModalClose = useCallback(() => {
    setIsVisualizerModalOpen(false);
  }, []);

  const visualizerModalInitialState = useMemo(
    () => ({
      state: dashcard.visualization_settings
        ?.visualization as Partial<VisualizerHistoryItem>,
    }),
    [dashcard.visualization_settings],
  );

  const series = useMemo(() => {
    const isVisualizerDashcard =
      !!dashcard?.visualization_settings?.visualization;
    if (
      !datasets ||
      !dashcard ||
      !_series ||
      _series.length === 0 ||
      !isVisualizerDashcard
    ) {
      return _series;
    }

    const { display, columns, columnValuesMapping, settings } = dashcard
      .visualization_settings!.visualization as VisualizerHistoryItem;

    const referencedColumns = extractReferencedColumns(columnValuesMapping);

    const referencedColumnValuesMap: Record<string, RowValues> = {};
    referencedColumns.forEach(ref => {
      const { sourceId } = parseDataSourceId(ref.sourceId);
      const dataset = datasets[sourceId];
      if (!dataset) {
        return;
      }
      const columnIndex = dataset.data.cols.findIndex(
        col => col.name === ref.originalName,
      );
      if (columnIndex >= 0) {
        const values = dataset.data.rows.map(row => row[columnIndex]);
        referencedColumnValuesMap[ref.name] = values;
      }
    });

    const hasPivotGrouping = columns.some(col => col.name === "pivot-grouping");
    if (hasPivotGrouping) {
      const rowLengths = Object.values(referencedColumnValuesMap).map(
        values => values.length,
      );
      const maxLength = rowLengths.length > 0 ? Math.max(...rowLengths) : 0;
      referencedColumnValuesMap["pivot-grouping"] = new Array(maxLength).fill(
        0,
      );
    }

    const unzippedRows = columns.map(column =>
      (columnValuesMapping[column.name] ?? [])
        .map(valueSource => {
          if (isDataSourceNameRef(valueSource)) {
            const id = getDataSourceIdFromNameRef(valueSource);
            return `Not supported yet (card ${id})`;
          }
          const values = referencedColumnValuesMap[valueSource.name];
          if (!values) {
            return [];
          }
          return values;
        })
        .flat(),
    );

    const mergedData = {
      cols: columns,
      rows: _.zip(...unzippedRows),
      results_metadata: { columns },
    };

    return [
      {
        card: {
          display,
          visualization_settings: settings,
        },

        data: mergedData,

        // Certain visualizations memoize settings computation based on series keys
        // This guarantees a visualization always rerenders on changes
        started_at: new Date().toISOString(),
      },
    ];
  }, [_series, dashcard, datasets]);

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
            iframe: t`Iframe Card`,
            visualization: t`Visualization Card`,
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
        onEditVisualization={editVisualization}
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
    editVisualization,
  ]);

  const { getExtraDataForClick } = useClickBehaviorData({
    dashcardId: dashcard.id,
  });

  return (
    <>
      <Visualization
        className={cx(CS.flexFull, {
          [CS.pointerEventsNone]: isEditingDashboardLayout,
          [CS.overflowAuto]: visualizationOverlay,
          [CS.overflowHidden]: !visualizationOverlay,
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
      {isVisualizerModalOpen && (
        <VisualizerModal
          onSave={onVisualizerModalSave}
          onClose={onVisualizerModalClose}
          initialState={visualizerModalInitialState}
          saveLabel={t`Save`}
        />
      )}
    </>
  );
}

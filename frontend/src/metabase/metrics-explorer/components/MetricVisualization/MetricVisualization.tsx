import { useCallback } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { findBreakoutClause } from "metabase/querying/filters/components/TimeseriesChrome/utils";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";
import type {
  MetricsExplorerDisplayType,
  ProjectionConfig,
  SpecificDateFilterSpec,
} from "metabase-types/store/metrics-explorer";
import {
  createNumericProjectionConfig,
  createTemporalProjectionConfig,
} from "metabase-types/store/metrics-explorer";

import { updateTabColumns } from "../../metrics-explorer.slice";
import {
  selectActiveTab,
  selectActiveTabType,
  selectDimensionItems,
  selectDimensionTabs,
  selectIsAllTabActive,
  selectModifiedQueries,
  selectQuestionForControls,
  selectRawSeries,
  selectSourceOrder,
} from "../../selectors";
import { extractFilterSpecFromQuery } from "../../utils/queries";
import {
  cardIdToMeasureId,
  createMeasureSourceId,
  createMetricSourceId,
  isMeasureCardId,
} from "../../utils/source-ids";
import { DISPLAY_TYPE_REGISTRY, getTabConfig } from "../../utils/tab-registry";
import { AllTabsVisualization } from "../AllTabsVisualization/AllTabsVisualization";
import { MetricControls } from "../MetricControls/MetricControls";
import { SeriesGrid } from "../SeriesGrid/SeriesGrid";

import S from "./MetricVisualization.module.css";

const STAGE_INDEX = -1;

type MetricVisualizationProps = {
  projectionConfig: ProjectionConfig;
  displayType: MetricsExplorerDisplayType;
  isLoading: boolean;
  error: string | null;
  showTimeControls?: boolean;
  onProjectionConfigChange: (config: ProjectionConfig) => void;
  onDisplayTypeChange: (displayType: MetricsExplorerDisplayType) => void;
};

export function MetricVisualization({
  projectionConfig: _projectionConfig,
  displayType,
  isLoading,
  error,
  showTimeControls = true,
  onProjectionConfigChange,
  onDisplayTypeChange,
}: MetricVisualizationProps) {
  const dispatch = useDispatch();
  const rawSeries = useSelector(selectRawSeries);
  const dimensionItems = useSelector(selectDimensionItems);
  const questionForControls = useSelector(selectQuestionForControls);
  const modifiedQueries = useSelector(selectModifiedQueries);
  const activeTabType = useSelector(selectActiveTabType);
  const activeTab = useSelector(selectActiveTab);
  const isAllTabActive = useSelector(selectIsAllTabActive);
  const dimensionTabs = useSelector(selectDimensionTabs);
  const sourceOrder = useSelector(selectSourceOrder);

  const handleDimensionChange = useCallback(
    (cardId: string | number, newColumn: Lib.ColumnMetadata) => {
      if (typeof cardId !== "number") {
        return;
      }

      let sourceId;
      let query: Lib.Query | null = null;

      if (isMeasureCardId(cardId)) {
        const measureId = cardIdToMeasureId(cardId);
        sourceId = createMeasureSourceId(measureId);
        query = modifiedQueries[sourceId];
      } else {
        sourceId = createMetricSourceId(cardId);
        query = modifiedQueries[sourceId];
      }

      const resolvedQuery =
        query ?? Object.values(modifiedQueries).find(Boolean);
      if (resolvedQuery && activeTab) {
        const columnInfo = Lib.displayInfo(
          resolvedQuery,
          STAGE_INDEX,
          Lib.withTemporalBucket(newColumn, null),
        );
        const tabConfig = getTabConfig(activeTab.type);
        const shouldUpdateLabel =
          tabConfig.matchMode === "exact-column" && sourceId === sourceOrder[0];

        dispatch(
          updateTabColumns({
            tabId: activeTab.id,
            sourceId,
            columnName: columnInfo.name,
            label: shouldUpdateLabel ? columnInfo.displayName : undefined,
          }),
        );
      }
    },
    [dispatch, modifiedQueries, activeTab, sourceOrder],
  );

  const handleQueryChange = useCallback(
    (newQuery: Lib.Query) => {
      const newBreakout = findBreakoutClause(newQuery, STAGE_INDEX);

      let unit: TemporalUnit = "month";
      if (newBreakout) {
        const bucket = Lib.temporalBucket(newBreakout);
        if (bucket) {
          const info = Lib.displayInfo(newQuery, STAGE_INDEX, bucket);
          unit = info.shortName as TemporalUnit;
        }
      }

      const newBreakoutCol = newBreakout
        ? Lib.breakoutColumn(newQuery, STAGE_INDEX, newBreakout)
        : null;

      const filterSpec = newBreakoutCol
        ? extractFilterSpecFromQuery(newQuery, newBreakoutCol)
        : null;

      onProjectionConfigChange(
        createTemporalProjectionConfig(unit, filterSpec),
      );
    },
    [onProjectionConfigChange],
  );

  const handleBinningChange = useCallback(
    (binningStrategy: string | null) => {
      onProjectionConfigChange(createNumericProjectionConfig(binningStrategy));
    },
    [onProjectionConfigChange],
  );

  const handleBrush = useCallback(
    ({ start, end }: { start: number; end: number }) => {
      const filterSpec: SpecificDateFilterSpec = {
        operator: "between",
        values: [new Date(start), new Date(end)],
        hasTime: true,
      };
      const unit =
        _projectionConfig.type === "temporal"
          ? _projectionConfig.unit
          : "month";
      onProjectionConfigChange(
        createTemporalProjectionConfig(unit, filterSpec),
      );
    },
    [onProjectionConfigChange, _projectionConfig],
  );

  const columnFilter = activeTabType
    ? getTabConfig(activeTabType).columnPredicate
    : undefined;

  if (isAllTabActive) {
    return <AllTabsVisualization tabs={dimensionTabs} />;
  }

  if (isLoading || error || rawSeries.length === 0) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const displayConfig = DISPLAY_TYPE_REGISTRY[displayType];
  const renderMultipleCharts =
    !displayConfig.supportsMultipleSeries && rawSeries.length > 1;

  return (
    <div className={S.root}>
      {renderMultipleCharts ? (
        <SeriesGrid
          rawSeries={rawSeries}
          dimensionItems={dimensionItems}
          columnFilter={columnFilter}
          onDimensionChange={handleDimensionChange}
        />
      ) : (
        <>
          <DebouncedFrame className={S.visualizationWrapper}>
            <Visualization
              className={S.visualization}
              rawSeries={rawSeries}
              isQueryBuilder={false}
              showTitle={!displayConfig.supportsMultipleSeries}
              hideLegend
              handleVisualizationClick={() => {}}
              onBrush={showTimeControls ? handleBrush : undefined}
            />
          </DebouncedFrame>
          {dimensionItems.length > 0 && (
            <DimensionPillBar
              items={dimensionItems}
              columnFilter={columnFilter}
              onDimensionChange={handleDimensionChange}
            />
          )}
        </>
      )}
      {questionForControls && activeTabType !== "geo" && (
        <div className={S.footer}>
          <MetricControls
            question={questionForControls}
            displayType={displayType}
            tabType={activeTabType}
            showTimeControls={showTimeControls}
            onDisplayTypeChange={onDisplayTypeChange}
            onQueryChange={handleQueryChange}
            onBinningChange={handleBinningChange}
          />
        </div>
      )}
    </div>
  );
}

import { useCallback } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { findBreakoutClause } from "metabase/querying/filters/components/TimeseriesChrome/utils";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";
import type {
  MetricsExplorerDisplayType,
  ProjectionConfig,
} from "metabase-types/store/metrics-explorer";

import {
  selectActiveTabType,
  selectDimensionItems,
  selectModifiedQueries,
  selectQuestionForControls,
  selectRawSeries,
} from "../../selectors";
import { isGeoColumn } from "../../utils/dimensions";
import {
  cardIdToMeasureId,
  createMeasureSourceId,
  createMetricSourceId,
  isMeasureCardId,
} from "../../utils/source-ids";
import { supportsMultipleSeries } from "../../utils/visualization-settings";
import { MetricControls } from "../MetricControls/MetricControls";

import S from "./MetricVisualization.module.css";

const STAGE_INDEX = -1;

type MetricVisualizationProps = {
  projectionConfig: ProjectionConfig;
  displayType: MetricsExplorerDisplayType;
  isLoading: boolean;
  error: string | null;
  showTimeControls?: boolean;
  onProjectionConfigChange: (config: ProjectionConfig) => void;
  onDimensionOverrideChange: (cardId: number, columnName: string) => void;
  onDisplayTypeChange: (displayType: MetricsExplorerDisplayType) => void;
};

export function MetricVisualization({
  projectionConfig,
  displayType,
  isLoading,
  error,
  showTimeControls = true,
  onProjectionConfigChange,
  onDimensionOverrideChange,
  onDisplayTypeChange,
}: MetricVisualizationProps) {
  // Select data from Redux
  const rawSeries = useSelector(selectRawSeries);
  const dimensionItems = useSelector(selectDimensionItems);
  const questionForControls = useSelector(selectQuestionForControls);
  const modifiedQueries = useSelector(selectModifiedQueries);
  const activeTabType = useSelector(selectActiveTabType);

  const handleDimensionChange = useCallback(
    (cardId: string | number, newColumn: Lib.ColumnMetadata) => {
      if (typeof cardId !== "number") {
        return;
      }

      let query: Lib.Query | null = null;

      if (isMeasureCardId(cardId)) {
        const measureId = cardIdToMeasureId(cardId);
        const sourceId = createMeasureSourceId(measureId);
        query = modifiedQueries[sourceId];
      } else {
        const sourceId = createMetricSourceId(cardId);
        query = modifiedQueries[sourceId];
      }

      if (query) {
        const columnInfo = Lib.displayInfo(query, STAGE_INDEX, newColumn);
        onDimensionOverrideChange(cardId, columnInfo.name);
      }
    },
    [modifiedQueries, onDimensionOverrideChange],
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
        ? Lib.extractFilterSpec(newQuery, newBreakoutCol)
        : null;

      onProjectionConfigChange({ unit, filterSpec });
    },
    [onProjectionConfigChange],
  );

  // Get column filter based on active tab type
  const columnFilter = getColumnFilterForTabType(activeTabType);

  if (isLoading || error || rawSeries.length === 0) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const renderMultipleCharts = !supportsMultipleSeries(displayType);

  return (
    <div className={S.root}>
      {renderMultipleCharts ? (
        <div className={S.chartGrid}>
          {rawSeries.map((series, index) => (
            <DebouncedFrame key={series.card.id ?? index} className={S.chartGridItem}>
              <Visualization
                className={S.visualization}
                rawSeries={[series]}
                isQueryBuilder={false}
                showTitle
                hideLegend
                handleVisualizationClick={() => {}}
              />
            </DebouncedFrame>
          ))}
        </div>
      ) : (
        <DebouncedFrame className={S.visualizationWrapper}>
          <Visualization
            className={S.visualization}
            rawSeries={rawSeries}
            isQueryBuilder={false}
            showTitle={false}
            hideLegend
            handleVisualizationClick={() => {}}
          />
        </DebouncedFrame>
      )}
      {dimensionItems.length > 0 && (
        <DimensionPillBar
          items={dimensionItems}
          columnFilter={columnFilter}
          onDimensionChange={handleDimensionChange}
        />
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
          />
        </div>
      )}
    </div>
  );
}

function getColumnFilterForTabType(
  tabType: string | null,
): ((col: Lib.ColumnMetadata) => boolean) | undefined {
  switch (tabType) {
    case "time":
      return Lib.isDateOrDateTime;
    case "geo":
      return isGeoColumn;
    case "boolean":
      return Lib.isBoolean;
    case "category":
      return (col) =>
        (Lib.isCategory(col) || Lib.isString(col)) &&
        !Lib.isPrimaryKey(col) &&
        !Lib.isForeignKey(col) &&
        !Lib.isURL(col) &&
        !isGeoColumn(col);
    default:
      return Lib.isDateOrDateTime;
  }
}

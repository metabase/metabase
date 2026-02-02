import { useCallback } from "react";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { findBreakoutClause } from "metabase/querying/filters/components/TimeseriesChrome/utils";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { TemporalUnit, TimeseriesDisplayType } from "metabase-types/api";
import type { ProjectionConfig } from "metabase-types/store/metrics-explorer";

import {
  selectDimensionItems,
  selectModifiedQueries,
  selectQuestionForControls,
  selectRawSeries,
} from "../../selectors";
import {
  cardIdToMeasureId,
  createMeasureSourceId,
  createMetricSourceId,
  isMeasureCardId,
} from "../../utils/source-ids";
import { MetricControls } from "../MetricControls/MetricControls";

import S from "./MetricVisualization.module.css";

const STAGE_INDEX = -1;

type MetricVisualizationProps = {
  projectionConfig: ProjectionConfig;
  displayType: TimeseriesDisplayType;
  isLoading: boolean;
  error: string | null;
  onProjectionConfigChange: (config: ProjectionConfig) => void;
  onDimensionOverrideChange: (cardId: number, columnName: string) => void;
  onDisplayTypeChange: (displayType: TimeseriesDisplayType) => void;
};

export function MetricVisualization({
  projectionConfig,
  displayType,
  isLoading,
  error,
  onProjectionConfigChange,
  onDimensionOverrideChange,
  onDisplayTypeChange,
}: MetricVisualizationProps) {
  // Select data from Redux
  const rawSeries = useSelector(selectRawSeries);
  const dimensionItems = useSelector(selectDimensionItems);
  const questionForControls = useSelector(selectQuestionForControls);
  const modifiedQueries = useSelector(selectModifiedQueries);

  const handleDimensionChange = useCallback(
    (cardId: string | number, newColumn: Lib.ColumnMetadata) => {
      if (typeof cardId !== "number") {
        return;
      }

      // Find the query for this card/measure
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

  if (isLoading || error || rawSeries.length === 0) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div className={S.root}>
      <DebouncedFrame className={S.visualizationWrapper}>
        <Visualization
          className={S.visualization}
          rawSeries={rawSeries}
          isQueryBuilder={false}
          showTitle={false}
          hideLegend
          // Prevent clicks from setting internal clicked state which disables tooltips
          handleVisualizationClick={() => {}}
        />
      </DebouncedFrame>
      {dimensionItems.length > 0 && (
        <DimensionPillBar
          items={dimensionItems}
          columnFilter={Lib.isDateOrDateTime}
          onDimensionChange={handleDimensionChange}
        />
      )}
      {questionForControls && (
        <div className={S.footer}>
          <MetricControls
            question={questionForControls}
            displayType={displayType}
            onDisplayTypeChange={onDisplayTypeChange}
            onQueryChange={handleQueryChange}
          />
        </div>
      )}
    </div>
  );
}

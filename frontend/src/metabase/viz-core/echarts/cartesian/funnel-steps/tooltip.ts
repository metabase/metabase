import { t } from "ttag";

import { formatDurationShort } from "metabase/utils/formatting";

import type { EChartsTooltipModel } from "../../../components/ChartTooltip/EChartsTooltip/EChartsTooltip";
import type { ComputedVisualizationSettings } from "../../../types";
import { INDEX_KEY } from "../constants/dataset";
import { getDatasetKey } from "../model/dataset";
import { isBreakoutSeries } from "../model/guards";
import type {
  BaseCartesianChartModel,
  DataKey,
  SeriesModel,
} from "../model/types";

import { FUNNEL_STEPS_MEDIAN_SECONDS_COLUMN } from "./model";
import { getFunnelSteps } from "./steps";

// Broken out, each group has its own median.
const getMedianSecondsFromPrevious = (
  chartModel: BaseCartesianChartModel,
  seriesModel: SeriesModel,
  dataIndex: number,
): number | undefined => {
  const column = Object.values(chartModel.columnByDataKey).find(
    ({ name }) => name === FUNNEL_STEPS_MEDIAN_SECONDS_COLUMN,
  );
  const datasetIndex = chartModel.transformedDataset[dataIndex]?.[INDEX_KEY];
  if (column === undefined || typeof datasetIndex !== "number") {
    return undefined;
  }
  const dataKey = isBreakoutSeries(seriesModel)
    ? getDatasetKey(column, seriesModel.cardId, seriesModel.breakoutValue)
    : getDatasetKey(column, seriesModel.cardId);
  const value = chartModel.dataset[datasetIndex]?.[dataKey];
  return typeof value === "number" ? value : undefined;
};

/**
 * The tooltip for a step of the funnel steps chart. A step's bar tells who
 * got there and how fast; the ghost bar above it tells who didn't. Broken
 * out, each group's bar tells it for that group, under the group's name.
 */
export const getFunnelStepsTooltipModel = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  dataIndex: number,
  seriesId: DataKey,
  isGhost: boolean,
): EChartsTooltipModel | null => {
  const steps = getFunnelSteps(
    chartModel,
    settings,
    isGhost ? undefined : seriesId,
  );
  if (!steps || dataIndex >= steps.counts.length) {
    return null;
  }
  const { seriesModel, stepNames, counts, formatCount, formatShare } = steps;
  const header = stepNames[dataIndex];
  const count = counts[dataIndex];
  const firstCount = counts[0];
  // No series marker: rows without one would leave its column misaligned.
  const countRow = { name: seriesModel.name, values: [formatCount(count)] };
  if (dataIndex === 0) {
    return { header, rows: [countRow] };
  }

  const previousCount = counts[dataIndex - 1];
  if (isGhost) {
    const droppedHere = Math.max(0, previousCount - count);
    const droppedSoFar = Math.max(0, firstCount - count);
    return {
      header,
      rows: [
        {
          name: t`Dropped off from previous step`,
          values: [
            formatCount(droppedHere),
            formatShare(droppedHere, previousCount),
          ],
        },
        {
          name: t`Dropped off from start`,
          values: [
            formatCount(droppedSoFar),
            formatShare(droppedSoFar, firstCount),
          ],
        },
      ],
    };
  }

  const medianSeconds = getMedianSecondsFromPrevious(
    chartModel,
    seriesModel,
    dataIndex,
  );
  return {
    header,
    rows: [
      countRow,
      {
        name: t`Converted from previous step`,
        values: [formatShare(count, previousCount)],
      },
      {
        name: t`Converted from start`,
        values: [formatShare(count, firstCount)],
      },
      ...(medianSeconds !== undefined
        ? [
            {
              name: t`Median time from previous step`,
              values: [formatDurationShort(medianSeconds * 1000)],
            },
          ]
        : []),
    ],
  };
};

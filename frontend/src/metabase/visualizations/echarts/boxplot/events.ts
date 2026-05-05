import { t } from "ttag";

import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { formatValueForTooltip } from "metabase/visualizations/components/ChartTooltip/utils";
import {
  INDEX_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getDatasetKey } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type { DataKey } from "metabase/visualizations/echarts/cartesian/model/types";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import type {
  ComputedVisualizationSettings,
  DataPoint,
} from "metabase/visualizations/types";
import type { ClickObject, ClickObjectDimension } from "metabase-lib";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import type {
  BoxPlotChartModel,
  BoxPlotDatum,
  BoxPlotSeriesModel,
} from "./model/types";
import {
  extractSeriesDataKeyFromName,
  isBoxPlotScatterSeriesName,
  isMeanSeriesName,
  isPointSeriesName,
} from "./utils";

const isDatasetRowObject = (value: unknown): value is Record<string, unknown> =>
  value != null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  X_AXIS_DATA_KEY in value;

const extractPointData = (
  dataValue: unknown,
  dataKey: DataKey,
): { xValue: RowValue; yValue: number; index: number | null } | null => {
  if (!isDatasetRowObject(dataValue)) {
    return null;
  }
  const xValue = dataValue[X_AXIS_DATA_KEY] as RowValue;
  const yValue = dataValue[dataKey];
  const rawIndex = dataValue[INDEX_KEY];
  const index = typeof rawIndex === "number" ? rawIndex : null;

  if (typeof yValue === "number" && Number.isFinite(yValue)) {
    return { xValue, yValue, index };
  }
  return null;
};

export const isBoxPlotSeriesEvent = (
  event: EChartsSeriesMouseEvent,
): boolean => {
  if (event.seriesType === "boxplot") {
    return true;
  }

  const seriesName = event.seriesName ?? "";
  return isBoxPlotScatterSeriesName(seriesName);
};

const findSeriesModelByEvent = (
  seriesModels: BoxPlotSeriesModel[],
  seriesId: string | undefined,
  seriesName: string | undefined,
): BoxPlotSeriesModel | null => {
  if (seriesModels.length === 0) {
    return null;
  }

  if (seriesId) {
    const matchById = seriesModels.find((s) => s.dataKey === seriesId);
    if (matchById) {
      return matchById;
    }
  }

  if (seriesName) {
    const extractedDataKey = extractSeriesDataKeyFromName(seriesName);
    if (extractedDataKey) {
      return seriesModels.find((s) => s.dataKey === extractedDataKey) ?? null;
    }
  }

  return null;
};

const createTooltipRow = (
  name: string,
  value: unknown,
  column: DatasetColumn | undefined,
  settings: ComputedVisualizationSettings,
  isAlreadyScaled = false,
): EChartsTooltipRow => ({
  name,
  values: [
    formatValueForTooltip({
      value,
      column,
      settings,
      isAlreadyScaled,
    }),
  ],
});

type DataBySeriesAndXValue = Map<DataKey, Map<RowValue, BoxPlotDatum>>;

const getDatumByXValue = (
  dataBySeriesAndXValue: DataBySeriesAndXValue,
  dataKey: DataKey,
  xValue: RowValue,
): BoxPlotDatum | undefined => dataBySeriesAndXValue.get(dataKey)?.get(xValue);

const getXIndexAndValue = (
  event: EChartsSeriesMouseEvent,
  dataBySeriesAndXValue: DataBySeriesAndXValue,
  dataKey: DataKey,
  xValues: RowValue[],
  fromEChartsAxisValue: (value: number) => number,
): { xIndex: number; specificValue: number | null } | null => {
  const { dataIndex, seriesType, seriesName, value } = event;

  if (dataIndex == null) {
    return null;
  }

  if (seriesType === "boxplot") {
    const xValue = xValues[dataIndex];
    const datum = getDatumByXValue(dataBySeriesAndXValue, dataKey, xValue);
    return { xIndex: dataIndex, specificValue: datum?.median ?? null };
  }

  if (isMeanSeriesName(seriesName)) {
    const xValue = xValues[dataIndex];
    const datum = getDatumByXValue(dataBySeriesAndXValue, dataKey, xValue);
    return { xIndex: dataIndex, specificValue: datum?.mean ?? null };
  }

  const pointData = extractPointData(value, dataKey);
  if (!pointData) {
    return null;
  }

  const xIndex = xValues.indexOf(pointData.xValue);
  const originalYValue = fromEChartsAxisValue(pointData.yValue);
  return {
    xIndex: xIndex >= 0 ? xIndex : dataIndex,
    specificValue: originalYValue,
  };
};

const buildBoxClickData = (
  dimensions: ClickObjectDimension[],
  seriesModel: BoxPlotSeriesModel,
  specificValue: number | null,
): DataPoint[] => {
  const data: DataPoint[] = [];

  for (const dim of dimensions) {
    data.push({
      key: dim.column.display_name,
      value: dim.value,
      col: dim.column,
    });
  }

  if (specificValue != null && seriesModel.column) {
    data.push({
      key: seriesModel.column.display_name,
      value: specificValue,
      col: seriesModel.column,
    });
  }

  return data;
};

const buildPointClickData = (
  rawDatum: Record<string, RowValue>,
  columnByDataKey: Record<DataKey, DatasetColumn>,
): DataPoint[] => {
  const data: DataPoint[] = [];

  for (const [dataKey, value] of Object.entries(rawDatum)) {
    if (dataKey === X_AXIS_DATA_KEY || value == null) {
      continue;
    }
    const column = columnByDataKey[dataKey];
    if (column) {
      data.push({
        key: column.display_name,
        value,
        col: column,
      });
    }
  }

  return data;
};

export const getBoxPlotClickData = (
  chartModel: BoxPlotChartModel,
  settings: ComputedVisualizationSettings,
  event: EChartsSeriesMouseEvent,
): ClickObject | null => {
  const { dataIndex, seriesName, seriesId, value } = event;
  const {
    xValues,
    dataBySeriesAndXValue,
    seriesModels,
    dimensionModel,
    breakoutColumn,
    yAxisScaleTransforms,
    columnByDataKey,
  } = chartModel;

  if (dataIndex == null || seriesModels.length === 0) {
    return null;
  }

  const seriesModel =
    findSeriesModelByEvent(seriesModels, seriesId, seriesName) ??
    seriesModels[0];

  const dimensionColumn = dimensionModel.column;
  const xIndexAndValue = getXIndexAndValue(
    event,
    dataBySeriesAndXValue,
    seriesModel.dataKey,
    xValues,
    yAxisScaleTransforms.fromEChartsAxisValue,
  );

  if (!xIndexAndValue) {
    return null;
  }

  const { xIndex, specificValue } = xIndexAndValue;
  const xValue = xValues[xIndex];
  if (xValue === undefined) {
    return null;
  }

  const dimensions: ClickObjectDimension[] = [];

  if (dimensionColumn) {
    dimensions.push({ column: dimensionColumn, value: xValue });
  }

  if (breakoutColumn && "breakoutValue" in seriesModel) {
    dimensions.push({
      column: breakoutColumn,
      value: seriesModel.breakoutValue,
    });
  }

  let data: DataPoint[];

  if (isPointSeriesName(seriesName)) {
    const pointData = extractPointData(value, seriesModel.dataKey);
    const datum = pointData
      ? getDatumByXValue(
          dataBySeriesAndXValue,
          seriesModel.dataKey,
          pointData.xValue,
        )
      : null;
    const rawDatum = findRawDatumByIndex(datum, pointData?.index ?? null);

    if (rawDatum) {
      data = buildPointClickData(rawDatum, columnByDataKey);
    } else {
      data = buildBoxClickData(dimensions, seriesModel, specificValue);
    }
  } else {
    data = buildBoxClickData(dimensions, seriesModel, specificValue);
  }

  return {
    cardId: seriesModel.cardId,
    event: event.event?.event,
    value: specificValue,
    column: seriesModel.column,
    dimensions,
    data,
    settings,
  };
};

export const getBoxPlotTooltipModel = (
  chartModel: BoxPlotChartModel,
  settings: ComputedVisualizationSettings,
  dataIndex: number,
  seriesName: string | undefined,
  seriesId: string | undefined,
  dataValue: unknown,
): EChartsTooltipModel | null => {
  const {
    xValues,
    dataBySeriesAndXValue,
    seriesModels,
    dimensionModel,
    showMean,
    breakoutColumn,
  } = chartModel;

  if (seriesModels.length === 0) {
    return null;
  }

  const seriesModel =
    findSeriesModelByEvent(seriesModels, seriesId, seriesName) ??
    seriesModels[0];

  if (isPointSeriesName(seriesName)) {
    return getPointTooltipModel(
      chartModel,
      seriesModel,
      dataBySeriesAndXValue,
      dataValue,
      settings,
    );
  }

  const xValue = xValues[dataIndex];
  const datum = getDatumByXValue(
    dataBySeriesAndXValue,
    seriesModel.dataKey,
    xValue,
  );

  if (!datum) {
    return null;
  }

  return getBoxTooltipModel(
    datum,
    seriesModel,
    dimensionModel.column,
    breakoutColumn,
    settings,
    showMean,
  );
};

const getBoxTooltipModel = (
  datum: BoxPlotDatum,
  seriesModel: BoxPlotSeriesModel,
  dimensionColumn: DatasetColumn | undefined,
  breakoutColumn: DatasetColumn | undefined,
  settings: ComputedVisualizationSettings,
  showMean: boolean,
): EChartsTooltipModel => {
  const metricColumn = seriesModel.column;

  const header = String(
    formatValueForTooltip({
      value: datum.xValue,
      column: dimensionColumn,
      settings,
    }),
  );

  const formatValue = (value: number) =>
    formatValueForTooltip({
      value,
      column: metricColumn,
      settings,
      isAlreadyScaled: true,
    });

  const hasBreakout = breakoutColumn != null && "breakoutValue" in seriesModel;

  const rows: EChartsTooltipRow[] = [
    ...(hasBreakout
      ? [
          {
            name: breakoutColumn.display_name,
            values: [
              formatValueForTooltip({
                value: seriesModel.breakoutValue,
                column: breakoutColumn,
                settings,
              }),
            ],
          },
        ]
      : []),
    {
      name: t`Upper whisker`,
      values: [formatValue(datum.max)],
    },
    {
      name: t`Q3 (75th percentile)`,
      values: [formatValue(datum.q3)],
    },
    {
      name: t`Median`,
      values: [formatValue(datum.median)],
    },
    ...(showMean && Number.isFinite(datum.mean)
      ? [{ name: t`Mean`, values: [formatValue(datum.mean)] }]
      : []),
    {
      name: t`Q1 (25th percentile)`,
      values: [formatValue(datum.q1)],
    },
    {
      name: t`Lower whisker`,
      values: [formatValue(datum.min)],
    },
  ];

  return {
    header,
    rows,
  };
};

const findRawDatumByIndex = (
  boxPlotDatum: BoxPlotDatum | null | undefined,
  index: number | null,
): Record<string, RowValue> | null => {
  if (boxPlotDatum == null || index == null) {
    return null;
  }
  const rawDataPoint = boxPlotDatum.rawDataPoints.find(
    (rp) => rp.index === index,
  );
  return rawDataPoint?.datum ?? null;
};

const buildPointTooltipRows = (
  rawDatum: Record<string, RowValue> | null,
  seriesModel: BoxPlotSeriesModel,
  dimensionColumn: DatasetColumn | undefined,
  breakoutColumn: DatasetColumn | undefined,
  columnByDataKey: Record<DataKey, DatasetColumn>,
  settings: ComputedVisualizationSettings,
): EChartsTooltipRow[] => {
  const metricColumn = seriesModel.column;
  const hasBreakout = breakoutColumn != null && "breakoutValue" in seriesModel;

  if (!rawDatum) {
    return [];
  }

  const metricValue = rawDatum[seriesModel.dataKey];
  const metricRow: EChartsTooltipRow[] =
    metricColumn && metricValue != null
      ? [
          createTooltipRow(
            metricColumn.display_name,
            metricValue,
            metricColumn,
            settings,
          ),
        ]
      : [];

  const breakoutRow: EChartsTooltipRow[] = hasBreakout
    ? [
        createTooltipRow(
          breakoutColumn.display_name,
          seriesModel.breakoutValue,
          breakoutColumn,
          settings,
        ),
      ]
    : [];

  const breakoutValue = hasBreakout ? seriesModel.breakoutValue : undefined;

  const skipDataKeys = new Set<DataKey>([seriesModel.dataKey, X_AXIS_DATA_KEY]);

  if (dimensionColumn) {
    skipDataKeys.add(
      getDatasetKey(dimensionColumn, seriesModel.cardId, breakoutValue),
    );
  }

  if (hasBreakout && breakoutColumn) {
    skipDataKeys.add(
      getDatasetKey(breakoutColumn, seriesModel.cardId, breakoutValue),
    );
  }

  const otherRows: EChartsTooltipRow[] = [];
  for (const [dataKey, value] of Object.entries(rawDatum)) {
    if (skipDataKeys.has(dataKey)) {
      continue;
    }
    const column = columnByDataKey[dataKey];
    if (column && value != null) {
      otherRows.push(
        createTooltipRow(column.display_name, value, column, settings),
      );
    }
  }

  return [...metricRow, ...breakoutRow, ...otherRows];
};

const getPointTooltipModel = (
  chartModel: BoxPlotChartModel,
  seriesModel: BoxPlotSeriesModel,
  dataBySeriesAndXValue: DataBySeriesAndXValue,
  dataValue: unknown,
  settings: ComputedVisualizationSettings,
): EChartsTooltipModel | null => {
  const {
    dimensionModel,
    whiskerType,
    breakoutColumn,
    columnByDataKey,
    yAxisScaleTransforms,
  } = chartModel;

  const pointData = extractPointData(dataValue, seriesModel.dataKey);
  if (!pointData) {
    return null;
  }

  const { xValue, index } = pointData;
  const yValue = yAxisScaleTransforms.fromEChartsAxisValue(pointData.yValue);
  const datum = getDatumByXValue(
    dataBySeriesAndXValue,
    seriesModel.dataKey,
    xValue,
  );

  if (!datum) {
    return null;
  }

  const dimensionColumn = dimensionModel.column;
  const isOutlier =
    whiskerType === "tukey" && (yValue < datum.min || yValue > datum.max);

  const xValueFormatted = String(
    formatValueForTooltip({
      value: datum.xValue,
      column: dimensionColumn,
      settings,
    }),
  );

  const header = isOutlier
    ? `${xValueFormatted} (${t`outlier`})`
    : xValueFormatted;

  const rawDatum = findRawDatumByIndex(datum, index);

  const rows = buildPointTooltipRows(
    rawDatum,
    seriesModel,
    dimensionColumn,
    breakoutColumn,
    columnByDataKey,
    settings,
  );

  return { header, rows };
};

import _ from "underscore";
import type {
  CartesianChartModel,
  DataKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { CardId, RawSeries } from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";
import { getObjectEntries } from "metabase/lib/objects";
import type { ClickObjectDimension } from "metabase-lib";
import type {
  ComputedVisualizationSettings,
  OnChangeCardAndRun,
  TooltipRowModel,
} from "metabase/visualizations/types";
import { formatValueForTooltip } from "metabase/visualizations/lib/tooltip";
import {
  hasClickBehavior,
  isRemappedToString,
} from "metabase/visualizations/lib/renderer_utils";
import { isStructured } from "metabase-lib/queries/utils/card";

export const parseDataKey = (dataKey: DataKey) => {
  let cardId: Nullable<CardId> = null;

  // breakoutValue can contain ":" so we need to split the dataKey by ":" and then join the rest of the parts
  const [cardIdString, columnName, ...breakoutValueParts] = dataKey.split(":");

  const parsedCardId = parseInt(cardIdString, 10);
  if (!isNaN(parsedCardId)) {
    cardId = parsedCardId;
  }

  const breakoutValue =
    breakoutValueParts.length === 0 ? undefined : breakoutValueParts.join(":");

  return { cardId, columnName, breakoutValue };
};

export const getEventDimensionsData = (
  chartModel: CartesianChartModel,
  seriesIndex: number,
  dataIndex: number,
) => {
  const datum = chartModel.dataset[dataIndex];
  const seriesModel = chartModel.seriesModels[seriesIndex];
  const dimensionValue = datum[chartModel.dimensionModel.dataKey];

  const dimensions: ClickObjectDimension[] = [
    {
      column: chartModel.dimensionModel.column,
      value: dimensionValue,
    },
  ];

  if ("breakoutColumn" in seriesModel) {
    dimensions.push({
      column: seriesModel.breakoutColumn,
      value: seriesModel.breakoutValue,
    });
  }

  return dimensions;
};

export const getEventColumnsData = (
  chartModel: CartesianChartModel,
  seriesIndex: number,
  dataIndex: number,
) => {
  const datum = chartModel.dataset[dataIndex];
  const seriesModel = chartModel.seriesModels[seriesIndex];

  const isBreakoutSeries = "breakoutColumn" in seriesModel;

  const eventData = getObjectEntries(datum)
    .map(([dataKey, value]) => {
      const { cardId, breakoutValue } = parseDataKey(dataKey);

      const isSameCard = cardId === seriesModel.cardId;
      const isDifferentBreakoutSeries =
        isBreakoutSeries && String(seriesModel.breakoutValue) !== breakoutValue;

      const shouldIncludeValue = isSameCard && !isDifferentBreakoutSeries;
      if (!shouldIncludeValue) {
        return null;
      }

      const col = chartModel.columnByDataKey[dataKey];

      return {
        key: col.display_name, // TODO: use the title from the viz settings
        value,
        col,
      };
    })
    .filter(isNotNull);

  if (isBreakoutSeries) {
    eventData.push({
      key: seriesModel.breakoutColumn.display_name,
      value: seriesModel.breakoutValue,
      col: seriesModel.breakoutColumn,
    });
  }

  return eventData;
};

export const getStackedTooltipModel = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesIndex: number,
  dataIndex: number,
) => {
  const column =
    chartModel.leftAxisModel?.column ?? chartModel.rightAxisModel?.column;

  const formatter = (value: unknown) =>
    String(
      formatValueForTooltip({
        value,
        settings,
        column,
      }),
    );

  const rows: TooltipRowModel[] = chartModel.seriesModels.map(seriesModel => {
    return {
      name: seriesModel.name,
      color: seriesModel.color,
      value: chartModel.dataset[dataIndex][seriesModel.dataKey],
      formatter,
    };
  });

  const [headerRows, bodyRows] = _.partition(
    rows,
    (_row, index) => index === seriesIndex,
  );

  const dimensionValue =
    chartModel.dataset[dataIndex][chartModel.dimensionModel.dataKey];

  const headerTitle = String(
    formatValueForTooltip({
      value: dimensionValue,
      column: chartModel.dimensionModel.column,
      settings,
    }),
  );

  return {
    headerTitle,
    headerRows,
    bodyRows,
    totalFormatter: formatter,
    showTotal: true,
    showPercentages: true,
  };
};

export const canBrush = (
  series: RawSeries,
  settings: ComputedVisualizationSettings,
  onChangeCardAndRun?: OnChangeCardAndRun,
) => {
  const hasCombinedCards = series.length > 1;
  const hasBrushableDimension =
    settings["graph.x_axis.scale"] != null &&
    !["ordinal", "histogram"].includes(settings["graph.x_axis.scale"]);

  return (
    !!onChangeCardAndRun &&
    hasBrushableDimension &&
    !hasCombinedCards &&
    isStructured(series[0].card) &&
    !isRemappedToString(series) &&
    !hasClickBehavior(series)
  );
};

import { NumberLike, StringLike } from "@visx/scale";
import { VisualizationSettings } from "metabase-types/api";
import {
  formatStaticValue,
  getRemappedValue,
} from "metabase/static-viz/lib/format";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { FunnelChartColumns } from "./data";

export const getStaticFormatters = (
  funnelColumns: FunnelChartColumns,
  settings: VisualizationSettings,
) => {
  const dimensionFormatter = (value: StringLike) => {
    const column = funnelColumns.dimension.column;
    const columnSettings = settings.column_settings?.[getColumnKey(column)];
    const valueToFormat = getRemappedValue(value, column);

    return String(
      formatStaticValue(valueToFormat, {
        column,
        ...columnSettings,
        jsx: false,
      }),
    );
  };

  const metricFormatter = (value: NumberLike, compact: boolean = false) => {
    const column = funnelColumns.metric.column;
    const columnSettings = settings.column_settings?.[getColumnKey(column)];
    const valueToFormat = getRemappedValue(value, column);

    return String(
      formatStaticValue(valueToFormat, {
        column,
        ...columnSettings,
        jsx: false,
        compact,
      }),
    );
  };

  return {
    dimensionFormatter,
    metricFormatter,
  };
};

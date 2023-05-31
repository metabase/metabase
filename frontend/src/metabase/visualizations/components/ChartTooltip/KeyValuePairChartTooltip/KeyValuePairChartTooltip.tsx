import { isValidElement, useMemo } from "react";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { RemappingHydratedDatasetColumn } from "metabase/visualizations/shared/types/data";
import {
  DataPoint,
  HoveredDimension,
  HoveredObject,
  VisualizationSettings,
} from "../types";
import { formatValueForTooltip } from "../utils";
import { TooltipTableCell } from "./KeyValuePairChartTooltip.styled";

export interface StackedDataTooltipProps {
  hovered: HoveredObject;
  settings: VisualizationSettings;
}

const KeyValuePairChartTooltip = ({
  hovered,
  settings,
}: StackedDataTooltipProps) => {
  const rows = useMemo(() => getRows(hovered), [hovered]);

  return (
    <table className="py1 px2">
      <tbody>
        {rows.map(({ key, value, col }, index) => (
          <TooltipRow
            key={index}
            name={key}
            value={value}
            column={col}
            settings={settings}
          />
        ))}
      </tbody>
    </table>
  );
};

export interface TooltipRowProps {
  name?: string;
  value?: any;
  column?: RemappingHydratedDatasetColumn;
  settings: VisualizationSettings;
}

const TooltipRow = ({ name, value, column, settings }: TooltipRowProps) => (
  <tr>
    {name ? (
      <TooltipTableCell className="text-light text-right pr1">
        {name}:
      </TooltipTableCell>
    ) : (
      <TooltipTableCell />
    )}
    <TooltipTableCell className="text-bold text-left">
      {isValidElement(value)
        ? value
        : formatValueForTooltip({ value, column, settings })}
    </TooltipTableCell>
  </tr>
);

const getRows = (hovered: HoveredObject) => {
  if (Array.isArray(hovered.data)) {
    return hovered.data.map(getRowFromDataPoint);
  }

  if (hovered.value !== undefined || hovered.dimensions) {
    const dimensions = [];
    if (hovered.dimensions) {
      dimensions.push(...hovered.dimensions);
    }
    if (hovered.value !== undefined) {
      dimensions.push({
        value: hovered.value,
        column: hovered.column,
      } as HoveredDimension);
    }
    return dimensions.map(getRowFromDimension);
  }

  return [];
};

const getRowFromDataPoint = (data: DataPoint) => ({
  ...data,
  key: data.key || (data.col && getFriendlyName(data.col)),
});

const getRowFromDimension = ({ column, value }: HoveredDimension) => ({
  key: column && getFriendlyName(column),
  value: value,
  col: column,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default KeyValuePairChartTooltip;

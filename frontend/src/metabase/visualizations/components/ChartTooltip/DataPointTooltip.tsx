import React, { useMemo } from "react";
import { Column } from "metabase-types/types/Dataset";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import {
  DataPoint,
  HoveredDimension,
  HoveredObject,
  VisualizationSettings,
} from "./types";
import { formatValueForTooltip } from "./utils";

export interface DataPointTooltipProps {
  hovered: HoveredObject;
  settings: VisualizationSettings;
}

const DataPointTooltip = ({ hovered, settings }: DataPointTooltipProps) => {
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
  column?: Column;
  settings: VisualizationSettings;
}

const TooltipRow = ({ name, value, column, settings }: TooltipRowProps) => (
  <tr>
    {name ? <td className="text-light text-right pr1">{name}:</td> : <td />}
    <td className="text-bold text-left">
      {React.isValidElement(value)
        ? value
        : formatValueForTooltip({ value, column, settings })}
    </td>
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

export default DataPointTooltip;

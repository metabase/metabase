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

type TooltipRowProps = {
  name?: string;
  value?: any;
  column?: Column;
  settings: VisualizationSettings;
};

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

type DataPointTooltipContentProps = {
  hovered: HoveredObject;
  settings: VisualizationSettings;
};

function getRowFromDataPoint(data: DataPoint) {
  return {
    ...data,
    key: data.key || (data.col && getFriendlyName(data.col)),
  };
}

function getRowFromDimension({ column, value }: HoveredDimension) {
  return {
    key: column && getFriendlyName(column),
    value: value,
    col: column,
  };
}

function DataPointTooltipContent({
  hovered,
  settings,
}: DataPointTooltipContentProps) {
  const rows = useMemo(() => {
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
  }, [hovered]);

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
}

export default DataPointTooltipContent;

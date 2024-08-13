import cx from "classnames";
import { isValidElement, useMemo } from "react";

import CS from "metabase/css/core/index.css";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  DataPoint,
  HoveredDimension,
  HoveredObject,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

import { formatValueForTooltip } from "../utils";

import {
  TableBody,
  TableCell,
  TableFooter,
  TooltipTable,
} from "./KeyValuePairChartTooltip.styled";

export interface StackedDataTooltipProps {
  hovered: HoveredObject;
  settings: ComputedVisualizationSettings;
}

const KeyValuePairChartTooltip = ({
  hovered,
  settings,
}: StackedDataTooltipProps) => {
  const rows = useMemo(() => getRows(hovered), [hovered]);
  const { isAlreadyScaled } = hovered;
  const footerRows = hovered.footerData;

  const showFooter = footerRows && footerRows.length > 0;

  return (
    <TooltipTable>
      <TableBody hasBottomSpacing={showFooter}>
        {rows.map(({ key, value, col }, index) => (
          <TooltipRow
            key={index}
            name={key}
            value={value}
            column={col}
            settings={settings}
            isAlreadyScaled={isAlreadyScaled}
          />
        ))}
      </TableBody>
      {showFooter && (
        <TableFooter>
          {footerRows.map(({ key, value, col }, index) => (
            <TooltipRow
              key={index}
              name={key}
              value={value}
              column={col}
              settings={settings}
            />
          ))}
        </TableFooter>
      )}
    </TooltipTable>
  );
};

export interface TooltipRowProps {
  name?: string;
  value?: any;
  column: RemappingHydratedDatasetColumn | DatasetColumn | null;
  settings: ComputedVisualizationSettings;
  isAlreadyScaled?: boolean;
}

const TooltipRow = ({
  name,
  value,
  column,
  settings,
  isAlreadyScaled,
}: TooltipRowProps) => (
  <tr>
    {name ? (
      <TableCell className={cx(CS.textLight, CS.textRight)}>{name}:</TableCell>
    ) : (
      <TableCell />
    )}
    <TableCell className={cx(CS.textBold, CS.textLeft)}>
      {isValidElement(value)
        ? value
        : formatValueForTooltip({ value, column, settings, isAlreadyScaled })}
    </TableCell>
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

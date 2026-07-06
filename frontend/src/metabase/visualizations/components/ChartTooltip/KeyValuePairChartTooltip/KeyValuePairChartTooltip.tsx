import cx from "classnames";
import { isValidElement, useMemo } from "react";

import CS from "metabase/css/core/index.css";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import type {
  ComputedVisualizationSettings,
  DataPoint,
  HoveredDimension,
  HoveredObject,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

import { formatValueForTooltip } from "../utils";

import S from "./KeyValuePairChartTooltip.module.css";

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
    <table className={S.tooltipTable}>
      <tbody className={cx(S.tableBody, { [S.hasBottomSpacing]: showFooter })}>
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
      </tbody>
      {showFooter && (
        <tfoot className={S.tableFooter}>
          {footerRows.map(({ key, value, col }, index) => (
            <TooltipRow
              key={index}
              name={key}
              value={value}
              column={col}
              settings={settings}
            />
          ))}
        </tfoot>
      )}
    </table>
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
      <td className={cx(S.tableCell, CS.textTooltipSecondary, CS.textRight)}>
        {name}:
      </td>
    ) : (
      <td className={S.tableCell} />
    )}
    <td className={cx(S.tableCell, CS.textBold, CS.textLeft)}>
      {isValidElement(value)
        ? value
        : formatValueForTooltip({ value, column, settings, isAlreadyScaled })}
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

export const getRowFromDataPoint = (data: DataPoint) => ({
  ...data,
  key: data.key || (data?.col?.display_name ?? NULL_DISPLAY_VALUE),
});

const getRowFromDimension = ({ column, value }: HoveredDimension) => ({
  key: column?.display_name,
  value: value,
  col: column,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default KeyValuePairChartTooltip;

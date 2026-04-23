import cx from "classnames";
import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import type { TooltipRowModel } from "metabase/visualizations/types";

import S from "./TooltipRow.module.css";

export interface TooltipRowProps extends TooltipRowModel {
  isHeader?: boolean;
  percent?: number;
}

export const TooltipRow = ({
  name,
  value,
  color,
  percent,
  isHeader,
  formatter = (value: unknown) => String(value),
}: TooltipRowProps) => (
  <tr className={cx(S.tooltipRowRoot, { [S.header]: isHeader })}>
    {color && (
      <td className={cx(S.cell, S.colorIndicatorCell)}>
        <span
          className={cx(S.colorIndicator, {
            [S.colorIndicatorLarge]: isHeader,
          })}
          style={{ backgroundColor: color }}
        />
      </td>
    )}
    <td className={S.cell} data-testid="row-name">
      {name}
    </td>
    <td className={cx(S.cell, S.valueCell)} data-testid="row-value">
      {formatter(value)}
    </td>
    {percent != null ? (
      <td className={cx(S.cell, S.percentCell)} data-testid="row-percent">
        {formatPercent(percent)}
      </td>
    ) : null}
  </tr>
);

interface TotalTooltipRow {
  value: string;
  percent?: number;
  hasIcon?: boolean;
}

export const TooltipTotalRow = ({
  value,
  percent,
  hasIcon,
}: TotalTooltipRow) => (
  <tr className={S.totalRowRoot}>
    {hasIcon && <td className={cx(S.cell, S.colorIndicatorCell)}>=</td>}
    <td className={S.cell} data-testid="row-name">
      {t`Total`}
    </td>
    <td className={cx(S.cell, S.valueCell)} data-testid="row-value">
      {value}
    </td>
    {percent != null && (
      <td className={cx(S.cell, S.percentCell)} data-testid="row-percent">
        {formatPercent(percent)}
      </td>
    )}
  </tr>
);

import React from "react";
import { t } from "ttag";
import { formatPercent } from "metabase/static-viz/lib/numbers";
import { TooltipRowModel } from "../types";
import {
  Cell,
  ColorIndicator,
  PercentCell,
  TooltipRowRoot,
  TotalRowRoot,
  ValueCell,
} from "./TooltipRow.styled";

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
  <TooltipRowRoot isHeader={isHeader}>
    {color && (
      <Cell>
        <ColorIndicator size={isHeader ? 12 : 8} color={color} />
      </Cell>
    )}
    <Cell data-testid="row-name">{name}</Cell>
    <ValueCell data-testid="row-value">{formatter(value)}</ValueCell>
    {percent != null ? (
      <PercentCell data-testid="row-percent">
        {formatPercent(percent)}
      </PercentCell>
    ) : null}
  </TooltipRowRoot>
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
  <TotalRowRoot>
    {hasIcon && <Cell>=</Cell>}
    <Cell data-testid="row-name">{t`Total`}</Cell>
    <ValueCell data-testid="row-value">{value}</ValueCell>
    {percent != null && (
      <PercentCell data-testid="row-percent">
        {formatPercent(percent)}
      </PercentCell>
    )}
  </TotalRowRoot>
);

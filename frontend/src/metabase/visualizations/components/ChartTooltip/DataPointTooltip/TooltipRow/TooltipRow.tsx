import React from "react";
import { t } from "ttag";
import { formatPercent } from "metabase/static-viz/lib/numbers"; // FIXME: extract from static viz
import { TooltipRowModel } from "../types";
import {
  Cell,
  ColorIndicator,
  PercentCell,
  TotalRowRoot,
  ValueCell,
} from "./TooltipRow.styled";

export interface TooltipRowProps extends TooltipRowModel {
  colorIndicatorSize?: number;
}

export const TooltipRow = ({
  name,
  value,
  colorIndicatorSize = 8,
  color,
  percent,
}: TooltipRowProps) => (
  <tr>
    {color && (
      <Cell>
        <ColorIndicator size={colorIndicatorSize} color={color} />
      </Cell>
    )}
    <Cell>{name}</Cell>
    <ValueCell>{value}</ValueCell>
    {percent && <PercentCell>{formatPercent(percent)}</PercentCell>}
  </tr>
);

interface TotalTooltipRow {
  value: string;
}

export const TooltipTotalRow = ({ value }: TotalTooltipRow) => (
  <TotalRowRoot>
    <Cell>=</Cell>
    <Cell>{t`Total`}</Cell>
    <ValueCell>{value}</ValueCell>
    <PercentCell>100%</PercentCell>
  </TotalRowRoot>
);

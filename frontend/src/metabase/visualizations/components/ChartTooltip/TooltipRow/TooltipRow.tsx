import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import { Text } from "metabase/ui";
import type { TooltipRowModel } from "metabase/visualizations/types";

import {
  Cell,
  ColorIndicator,
  ColorIndicatorCell,
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
      <ColorIndicatorCell>
        <ColorIndicator size={isHeader ? 12 : 8} color={color} />
      </ColorIndicatorCell>
    )}
    <Cell data-testid="row-name">
      <Text
        lineClamp={3}
        c="text-secondary-inverse"
        style={{ whiteSpace: "pre-line" }}
        inherit
      >
        {name}
      </Text>
    </Cell>
    <ValueCell data-testid="row-value">
      <Text
        lineClamp={3}
        c="text-secondary-inverse"
        style={{ whiteSpace: "pre-line" }}
        inherit
      >
        {formatter(value)}
      </Text>
    </ValueCell>
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
    {hasIcon && <ColorIndicatorCell>=</ColorIndicatorCell>}
    <Cell data-testid="row-name">{t`Total`}</Cell>
    <ValueCell data-testid="row-value">{value}</ValueCell>
    {percent != null && (
      <PercentCell data-testid="row-percent">
        {formatPercent(percent)}
      </PercentCell>
    )}
  </TotalRowRoot>
);

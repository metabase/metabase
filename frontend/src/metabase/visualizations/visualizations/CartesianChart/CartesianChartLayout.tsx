import cx from "classnames";
import type { ComponentProps, ReactNode } from "react";

import { Box, useMantineTheme } from "metabase/ui";
import { LegendLayout } from "metabase/visualizations/components/legend/LegendLayout";

import S from "./CartesianChart.module.css";
import { getChartGap, getChartPadding } from "./padding";
import type { CartesianCardSizeTier } from "./sizing";

interface CartesianChartRootProps {
  isQueryBuilder?: boolean;
  sizeTier?: CartesianCardSizeTier;
  className?: string;
  children: ReactNode;
}

export function CartesianChartRoot({
  isQueryBuilder,
  sizeTier,
  className,
  children,
}: CartesianChartRootProps) {
  const theme = useMantineTheme();

  return (
    <Box
      className={cx(S.root, className)}
      style={{
        padding: getChartPadding({ theme, isQueryBuilder, sizeTier }),
        gap: getChartGap({ isQueryBuilder, sizeTier }),
      }}
    >
      {children}
    </Box>
  );
}

export function CartesianChartLegendLayout({
  className,
  ...props
}: ComponentProps<typeof LegendLayout>) {
  return <LegendLayout {...props} className={cx(S.legendLayout, className)} />;
}

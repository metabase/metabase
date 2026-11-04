import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Flex, useMantineTheme } from "metabase/ui";
import { LegendLayout } from "metabase/visualizations/components/legend/LegendLayout";

import S from "./CartesianChartLayout.module.css";
import { getChartPadding } from "./padding";

type CartesianChartRootProps = {
  isQueryBuilder?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function CartesianChartRoot({
  isQueryBuilder,
  className,
  children,
}: CartesianChartRootProps) {
  const theme = useMantineTheme();
  const padding = getChartPadding({ theme, isQueryBuilder });

  return (
    <Flex
      className={cx(S.root, CS.overflowHidden, className)}
      direction="column"
      h="100%"
      gap={isQueryBuilder ? 0 : "0.325rem"}
      // a custom property, which CSSProperties does not type
      style={{ "--cartesian-chart-padding": padding } as React.CSSProperties}
    >
      {children}
    </Flex>
  );
}

// kept under this name so its two usage sites stay untouched while the dynamic-goals branch reworks them
export const CartesianChartLegendLayout = LegendLayout;

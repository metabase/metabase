import styled from "@emotion/styled";

import type { MantineTheme } from "metabase/ui";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import LegendLayout from "metabase/visualizations/components/legend/LegendLayout";

type CartesianChartRootProps = {
  theme: MantineTheme;
  isQueryBuilder?: boolean;
};

const getChartPadding = ({
  theme,
  isQueryBuilder,
}: CartesianChartRootProps) => {
  if (isQueryBuilder) {
    return "1rem 1rem 1rem 2rem";
  }

  return theme.other.cartesian.padding;
};

export const CartesianChartRoot = styled.div<CartesianChartRootProps>`
  padding: ${getChartPadding};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ isQueryBuilder }) => (isQueryBuilder ? "0" : "0.325rem")};
  overflow: hidden;
`;

export const CartesianChartLegendLayout = styled(LegendLayout)`
  flex: 1 1 auto;
`;

// created in ExplicitSize
export const CartesianChartRenderer = styled(ResponsiveEChartsRenderer)`
  height: 100%;
`;

import styled from "@emotion/styled";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import LegendLayout from "metabase/visualizations/components/legend/LegendLayout";

import { getChartPadding } from "./padding";

type CartesianChartRootProps = {
  isQueryBuilder?: boolean;
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

import styled from "@emotion/styled";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import LegendLayout from "metabase/visualizations/components/legend/LegendLayout";

export const CartesianChartRoot = styled.div<{ isQueryBuilder: boolean }>`
  padding: ${({ isQueryBuilder }) =>
    isQueryBuilder ? "1rem 1rem 1rem 2rem" : "0.5rem 1rem"};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ isQueryBuilder }) => (isQueryBuilder ? "0" : "0.325rem")};
  overflow: hidden;
`;

export const CartesianChartLegendLayout = styled(LegendLayout)`
  flex: 1 1 auto;
`;

// @ts-expect-error emotion does not accept the `WrappedComponent` class type
// created in ExplicitSize
export const CartesianChartRenderer = styled(ResponsiveEChartsRenderer)`
  height: 100%;
`;

import styled from "@emotion/styled";
import LegendLayout from "metabase/visualizations/components/legend/LegendLayout";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";

export const CartesianChartRoot = styled.div<{ isQueryBuilder: boolean }>`
  padding: ${({ isQueryBuilder }) =>
    isQueryBuilder ? "1rem 1rem 1rem 2rem" : "0.5rem 1rem"};
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const CartesianChartLegendLayout = styled(LegendLayout)`
  flex: 1 1 auto;
`;

export const CartesianChartRenderer = styled(ResponsiveEChartsRenderer)`
  height: 100%;
`;

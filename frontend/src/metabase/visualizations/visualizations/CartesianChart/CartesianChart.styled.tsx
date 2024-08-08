import styled from "@emotion/styled";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { LegendLayout } from "metabase/visualizations/components/legend/LegendLayout";

type CartesianChartRootProps = {
  isQueryBuilder?: boolean;
  isEmbeddingSdk?: boolean;
};

const getChartPadding = ({
  isEmbeddingSdk,
  isQueryBuilder,
}: CartesianChartRootProps) => {
  if (isEmbeddingSdk) {
    return "0rem";
  }
  if (isQueryBuilder) {
    return "1rem 1rem 1rem 2rem";
  }

  return "0.5rem 1rem";
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

// @ts-expect-error emotion does not accept the `WrappedComponent` class type
// created in ExplicitSize
export const CartesianChartRenderer = styled(ResponsiveEChartsRenderer)`
  height: 100%;
`;

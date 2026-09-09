// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LegendLayout } from "metabase/visualizations/components/legend/LegendLayout";

import { getChartGap, getChartPadding } from "./padding";
import type { CartesianCardSizeTier } from "./sizing";

type CartesianChartRootProps = {
  isQueryBuilder?: boolean;
  sizeTier?: CartesianCardSizeTier;
};

export const CartesianChartRoot = styled.div<CartesianChartRootProps>`
  padding: ${getChartPadding};
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: ${getChartGap};
  overflow: hidden;
`;

export const CartesianChartLegendLayout = styled(LegendLayout)`
  flex: 1 1 auto;
`;

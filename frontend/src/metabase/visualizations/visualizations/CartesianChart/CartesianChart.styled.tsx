// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LegendLayout } from "metabase/visualizations/components/legend/LegendLayout";
import type { DashcardSizeTier } from "metabase/visualizations/lib/dashcard-sizing";

import { getChartGap, getChartPadding } from "./padding";

type CartesianChartRootProps = {
  isQueryBuilder?: boolean;
  sizeTier?: DashcardSizeTier;
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

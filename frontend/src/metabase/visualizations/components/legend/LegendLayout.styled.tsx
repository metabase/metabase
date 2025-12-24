// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import type { LegendPosition } from "metabase-types/api";

type LegendLayoutRootProps = {
  isVertical: boolean;
  legendPosition: LegendPosition;
};

export const LegendLayoutRoot = styled.div<LegendLayoutRootProps>`
  display: flex;
  flex: 1 1 auto;
  flex-direction: ${({ isVertical }) => (isVertical ? "row" : "column")};
  min-width: 0;
  min-height: 0;
`;

export const MainContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
`;

type LegendContainerProps = {
  isVertical: boolean;
  isQueryBuilder: boolean;
  legendPosition: LegendPosition;
};

const getVerticalSpacing = (
  isQueryBuilder: boolean,
  legendPosition: LegendPosition,
) => {
  const spacing = isQueryBuilder ? "2.5rem" : "0.5rem";
  // For left position, the legend appears before the chart, so margin is on the right
  // For right or auto-vertical, the legend appears after the chart, so margin is on the left
  if (legendPosition === "left") {
    return { marginRight: spacing, marginLeft: "" };
  }
  // Right position - legend appears after chart, needs margin-left to separate from chart
  return { marginRight: "", marginLeft: spacing };
};

const getHorizontalSpacing = (legendPosition: LegendPosition) => {
  // For bottom position, the legend appears after the chart, so margin is on the top
  // For top or auto-horizontal, the legend appears before the chart, so margin is on the bottom
  if (legendPosition === "bottom") {
    return { marginTop: "0.5rem", marginBottom: "" };
  }
  return { marginTop: "", marginBottom: "0.5rem" };
};

const shouldCenterVertically = (legendPosition: LegendPosition) =>
  legendPosition === "left" || legendPosition === "right";

export const LegendContainer = styled.div<LegendContainerProps>`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
  max-width: ${({ isVertical }) => (isVertical ? "min(25%, 20rem)" : "")};
  margin-right: ${({ isVertical, isQueryBuilder, legendPosition }) =>
    isVertical
      ? getVerticalSpacing(isQueryBuilder, legendPosition).marginRight
      : ""};
  margin-left: ${({ isVertical, isQueryBuilder, legendPosition }) =>
    isVertical
      ? getVerticalSpacing(isQueryBuilder, legendPosition).marginLeft
      : ""};
  margin-top: ${({ isVertical, legendPosition }) =>
    !isVertical ? getHorizontalSpacing(legendPosition).marginTop : ""};
  margin-bottom: ${({ isVertical, legendPosition }) =>
    !isVertical ? getHorizontalSpacing(legendPosition).marginBottom : ""};
  justify-content: ${({ isVertical, legendPosition }) => {
    if (isVertical && shouldCenterVertically(legendPosition)) {
      return "center";
    }
    if (!isVertical && legendPosition === "bottom") {
      return "center";
    }
    return "";
  }};
`;

export const ChartContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
`;

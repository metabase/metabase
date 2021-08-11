import styled from "styled-components";

export const LegendLayoutRoot = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: ${({ isVertical }) => (isVertical ? "row" : "column")};
`;

export const LegendContainer = styled.div`
  flex: 0 0 auto;
  margin-right: ${({ isVertical }) => (isVertical ? "0.5rem" : "")};
  margin-bottom: ${({ isVertical }) => (isVertical ? "" : "0.5rem")};
`;

export const ChartContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
`;

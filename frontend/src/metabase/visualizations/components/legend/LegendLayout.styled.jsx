import styled from "styled-components";

export const LegendLayoutRoot = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: ${({ isVertical }) => (isVertical ? "row" : "column")};
`;

export const LegendContainer = styled.div`
  flex: 0 0 auto;
  max-width: ${({ isVertical }) => (isVertical ? "25%" : "")};
  max-width: ${({ isVertical }) => (isVertical ? "min(25%, 320px)" : "")};
  margin: -1px;
  padding: calc(0.5rem + 1px);
`;

export const ChartContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  padding: ${({ isVertical }) =>
    isVertical ? "0.5rem 0.5rem 0.5rem 0" : "0 0.5rem 0.5rem"};
`;

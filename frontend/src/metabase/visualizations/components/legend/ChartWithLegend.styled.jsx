import styled from "styled-components";

export const ChartWithLegendRoot = styled.div`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "row" : "column")};
  min-height: 0;
`;

export const LegendContent = styled.div`
  min-width: ${({ isVertical }) => (isVertical ? "4rem" : "")};
  max-width: ${({ isVertical }) => (isVertical ? "20rem" : "")};
  overflow-y: ${({ isVertical }) => (isVertical ? "auto" : "")};
  margin-right: ${({ isVertical }) => (isVertical ? "1rem" : "")};
  margin-bottom: ${({ isVertical }) => (isVertical ? "" : "1rem")};
`;

export const ChartContent = styled.div`
  display: flex;
  flex: 1 1 auto;
  position: relative;
`;

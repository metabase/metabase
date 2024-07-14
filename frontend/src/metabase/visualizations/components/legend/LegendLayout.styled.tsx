import styled from "@emotion/styled";

export const LegendLayoutRoot = styled.div<{ isVertical: boolean }>`
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

export const LegendContainer = styled.div<{
  isVertical: boolean;
  isQueryBuilder: boolean;
}>`
  display: ${({ isVertical }) => (isVertical ? "block" : "flex")};
  max-width: ${({ isVertical }) => (isVertical ? "min(25%, 20rem)" : "")};
  margin-right: ${({ isVertical, isQueryBuilder }) =>
    isVertical ? (isQueryBuilder ? "2.5rem" : "0.5rem") : ""};
  margin-bottom: ${({ isVertical }) => (isVertical ? "" : "0.5rem")};
`;

export const ChartContainer = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
`;

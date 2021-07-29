import styled from "styled-components";
import { space } from "metabase/styled-components/theme";

export const LegendLayoutRoot = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: ${({ isVertical }) => (isVertical ? "row" : "column")};
  min-height: 0;
`;

export const LegendPanel = styled.div`
  min-width: ${({ isVertical }) => (isVertical ? "4rem" : "")};
  max-width: ${({ isVertical }) => (isVertical ? "25%" : "")};
  max-width: ${({ isVertical }) => (isVertical ? "min(25%, 20rem)" : "")};
  overflow-y: ${({ isVertical }) => (isVertical ? "auto" : "")};
  margin-right: ${({ isVertical }) => (isVertical ? space(2) : "")};
  margin-bottom: ${({ isVertical }) => (isVertical ? "" : space(2))};
`;

export const ChartPanel = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  position: relative;
  min-width: 0;
`;

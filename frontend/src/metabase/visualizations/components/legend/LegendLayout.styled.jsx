import styled from "styled-components";
import { space } from "metabase/styled-components/theme";

export const LegendLayoutRoot = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: ${({ isVertical }) => (isVertical ? "row" : "column")};
`;

export const LegendPanel = styled.div`
  flex: ${({ isVertical }) => (isVertical ? "1 0 auto" : "")};
  position: relative;
  min-width: ${({ isVertical }) => (isVertical ? "4rem" : "")};
  max-width: ${({ isVertical }) => (isVertical ? "min(25%, 20rem)" : "")};
  margin-right: ${({ isVertical }) => (isVertical ? space(2) : "")};
  margin-bottom: ${({ isVertical }) => (isVertical ? "" : space(2))};
`;

export const LegendOverflow = styled.div`
  position: ${({ isVertical }) => (isVertical ? "absolute" : "")};
  overflow-y: ${({ isVertical }) => (isVertical ? "auto" : "")};
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

export const ChartPanel = styled.div`
  display: flex;
  flex: 3 0 auto;
  position: relative;
`;

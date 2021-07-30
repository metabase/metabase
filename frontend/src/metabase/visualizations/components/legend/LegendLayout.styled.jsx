import styled from "styled-components";
import { space } from "metabase/styled-components/theme";

export const LegendLayoutRoot = styled.div`
  display: flex;
  flex-grow: 1;
  flex-direction: ${({ isVertical }) => (isVertical ? "row" : "column")};
  min-height: 0;
`;

export const LegendPanel = styled.div`
  position: relative;
  min-width: ${({ isVertical }) => (isVertical ? "4rem" : "")};
  max-width: ${({ isVertical }) => (isVertical ? "min(25%, 20rem)" : "")};
  margin-right: ${({ isVertical }) => (isVertical ? space(2) : "")};
  margin-bottom: ${({ isVertical }) => (isVertical ? "" : space(2))};
  overflow-y: ${({ isVertical }) => (isVertical ? "auto" : "")};
`;

export const ChartPanel = styled.div`
  display: flex;
  flex-grow: 1;
  flex-direction: column;
  position: relative;
  min-width: 0;
`;

import styled from "styled-components";

export const LegendRoot = styled.div`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
`;

export const LegendButtonGroup = styled.span`
  flex: 0 0 auto;
  position: relative;
  margin-left: ${({ isVertical }) => (isVertical ? "" : "auto")};
`;

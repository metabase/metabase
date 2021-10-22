import styled from "styled-components";

import colors, { darken } from "metabase/lib/colors";

export const LegendRoot = styled.div`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
  overflow: ${({ isVertical }) => (isVertical ? "" : "hidden")};
`;

export const LegendLink = styled.div`
  cursor: pointer;
  color: ${colors["brand"]};
  font-weight: bold;

  &:hover {
    color: ${darken(colors["brand"])};
  }
`;

export const LegendLinkContainer = styled.div`
  margin-top: ${({ isVertical }) => (isVertical ? "0.5rem" : "")};
`;

export const LegendPopoverContainer = styled.div`
  padding: 0.5rem;
`;

import styled from "@emotion/styled";

import { color, darken } from "metabase/lib/colors";

export const LegendRoot = styled.div<{ isVertical: boolean }>`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
  overflow: ${({ isVertical }) => (isVertical ? "" : "hidden")};
`;

export const LegendLink = styled.div`
  cursor: pointer;
  color: ${color("brand")};
  font-weight: bold;

  &:hover {
    color: ${darken("brand")};
  }
`;

export const LegendLinkContainer = styled.div<{ isVertical: boolean }>`
  margin-top: ${({ isVertical }) => (isVertical ? "0.5rem" : "")};
`;

export const LegendPopoverContainer = styled.div`
  padding: 0.5rem;
`;

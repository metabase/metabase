import styled from "styled-components";
import colors, { darken } from "metabase/lib/colors";

export const LegendRoot = styled.div`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
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

export const LegendButtonContainer = styled.span`
  flex: 0 0 auto;
  position: relative;
  margin-left: ${({ isVertical }) => (isVertical ? "" : "auto")};
`;

export const LegendPopoverContainer = styled.div`
  padding: 0.5rem 1rem;
`;

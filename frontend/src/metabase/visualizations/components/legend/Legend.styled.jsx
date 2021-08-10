import styled from "styled-components";
import colors from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const LegendRoot = styled.div`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
`;

export const LegendButton = styled.div`
  color: ${colors["text-medium"]};
  cursor: pointer;
  font-weight: bold;
  margin-top: ${space(1)};

  &:hover {
    color: ${colors["brand"]};
  }
`;

export const LegendButtonGroup = styled.span`
  flex: 0 0 auto;
  position: relative;
  margin-left: ${({ isVertical }) => (isVertical ? "" : space(1))};
`;

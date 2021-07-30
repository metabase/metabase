import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { space } from "metabase/styled-components/theme";

export const LegendItemRoot = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;

  &:not(:first-child) {
    margin-top: ${({ isVertical }) => (isVertical ? space(1) : "")};
    margin-left: ${({ isVertical }) => (isVertical ? "" : space(2))};
  }
`;

export const LegendItemDot = styled.div`
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background-color: ${({ color }) => color};
`;

export const LegendItemLabel = styled.div`
  display: flex;
  align-items: baseline;
  opacity: ${({ isMuted }) => (isMuted ? "0.4" : "1")};
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};
  transition: opacity 0.25s linear;

  &:hover {
    color: ${({ onMouseEnter }) => (onMouseEnter ? colors["brand"] : "")};
  }
`;

export const LegendItemTitle = styled.div`
  color: ${colors["text-dark"]};
  font-weight: bold;
  display: ${({ hasSubtitle }) => (hasSubtitle ? "flex" : "")};
  flex-wrap: ${({ hasSubtitle }) => (hasSubtitle ? "wrap" : "")};

  &:not(:first-child) {
    margin-left: ${({ hasSubtitle }) => (hasSubtitle ? "0.25rem" : "0.5rem")};
  }
`;

export const LegendItemSubtitle = styled.span`
  margin-left: 0.25rem;
  margin-right: 0.25rem;
`;

export const LegendItemRemoveIcon = styled(Icon).attrs({
  name: "close",
  size: 12,
})`
  color: ${colors["text-light"]};
  cursor: pointer;
  margin-left: ${space(1)};

  &:hover {
    color: ${colors["text-medium"]};
  }
`;

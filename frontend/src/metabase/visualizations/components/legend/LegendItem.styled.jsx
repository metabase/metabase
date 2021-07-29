import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { space } from "metabase/styled-components/theme";

export const LegendItemRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;

  &:not(:first-child) {
    margin-top: ${({ isVertical }) => (isVertical ? space(1) : "")};
    margin-left: ${({ isVertical }) => (isVertical ? "" : space(2))};
  }
`;

export const LegendItemLabel = styled.div`
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  min-width: 0;
  color: ${colors["text-dark"]};
  font-weight: bold;
  opacity: ${({ isMuted }) => (isMuted ? "0.4" : "1")};
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};
  transition: opacity 0.25s linear;

  &:hover {
    color: ${({ onMouseEnter }) => (onMouseEnter ? colors["brand"] : "")};
  }
`;

export const LegendItemDot = styled.div`
  display: block;
  flex: 0 0 auto;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background-color: ${({ color }) => color};
`;

export const LegendItemTitle = styled.div`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  margin-left: ${({ showDot }) => (showDot ? space(1) : "")};
  overflow: hidden;
`;

export const LegendItemSubtitle = styled.span`
  display: inline-block;

  &:not(:first-child) {
    padding-left: ${space(1)};
  }
`;

export const LegendItemRemoveIcon = styled(Icon).attrs({
  name: "close",
  size: 12,
})`
  display: flex;
  flex: 0 0 auto;
  margin-left: ${space(1)};
  color: ${colors["text-light"]};
  cursor: pointer;

  &:hover {
    color: ${colors["text-medium"]};
  }
`;

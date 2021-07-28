import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const LegendItemRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;

  &:not(:first-child) {
    margin-top: ${({ isVertical }) => (isVertical ? "0.5rem" : "")};
    margin-left: ${({ isVertical }) => (isVertical ? "" : "1rem")};
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
  margin-left: ${({ showDot }) => (showDot ? "0.5rem" : "")};
  overflow: hidden;
`;

export const LegendItemSubtitle = styled.span`
  display: inline-block;

  &:not(:first-child) {
    margin-left: auto;
    padding-left: 0.5rem;
  }
`;

export const LegendItemDescription = styled.div`
  display: flex;
  align-items: center;
  color: ${colors["text-medium"]};
  margin-left: 0.5rem;
`;

export const LegendItemRemoveIcon = styled(Icon).attrs({
  name: "close",
  size: 12,
})`
  display: flex;
  flex: 0 0 auto;
  margin-left: 0.5rem;
  color: ${colors["text-light"]};
  cursor: pointer;

  &:hover {
    color: ${colors["text-medium"]};
  }
`;

import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const LegendItemRoot = styled.div<{ isVertical: boolean }>`
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;

  &:not(:first-of-type) {
    margin-top: ${({ isVertical }) => (isVertical ? "0.5rem" : "")};
    margin-left: ${({ isVertical }) => (isVertical ? "" : "0.75rem")};
  }
`;

export const LegendItemLabel = styled.div<{ isMuted: boolean }>`
  display: flex;
  align-items: center;
  opacity: ${({ isMuted }) => (isMuted ? "0.4" : "1")};
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};
  overflow: hidden;
  transition: opacity 0.25s linear;

  &:hover {
    color: ${({ onMouseEnter }) => (onMouseEnter ? color("brand") : "")};
  }
`;

export const LegendItemDot = styled.div`
  flex: 0 0 auto;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background-color: ${({ color }) => color};
  color-adjust: exact;
`;

export const LegendItemTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  font-size: 12px;
  margin-left: 4px;
  overflow: hidden;
`;

export const LegendItemRemoveIcon = styled(Icon)`
  color: ${color("text-light")};
  cursor: pointer;
  margin-left: 0.5rem;

  &:hover {
    color: ${color("text-medium")};
  }
`;

LegendItemRemoveIcon.defaultProps = {
  name: "close",
  size: 12,
};

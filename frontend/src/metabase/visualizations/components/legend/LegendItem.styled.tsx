import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const LegendItemRoot = styled.div<{ isVertical: boolean }>`
  display: flex;
  align-items: center;
  min-width: 0;

  &:not(:first-of-type) {
    margin-top: ${({ isVertical }) => (isVertical ? "0.5rem" : "")};
    margin-left: ${({ isVertical }) => (isVertical ? "" : "0.75rem")};
  }
`;

export const LegendItemLabel = styled.div<{ isMuted: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  opacity: ${({ isMuted }) => (isMuted ? "0.4" : "1")};
  transition: opacity 0.25s linear;

  &:hover {
    color: ${({ onMouseEnter }) => onMouseEnter && "var(--mb-color-brand)"};
  }
`;

const LEGEND_ITEM_DOT_SIZE = 12;
const LEGEND_ITEM_TITLE_MARGIN = 4;

export const LegendItemTitle = styled.div<{ isInsidePopover?: boolean }>`
  color: var(--mb-color-text-primary);
  font-size: 0.85em;
  margin-left: ${LEGEND_ITEM_TITLE_MARGIN}px;
  overflow: hidden;
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};
  max-width: ${props =>
    props.isInsidePopover
      ? `calc(100% - ${LEGEND_ITEM_DOT_SIZE}px - ${LEGEND_ITEM_TITLE_MARGIN}px)`
      : "unset"};

  &:hover {
    color: ${({ onClick }) => onClick && "var(--mb-color-brand)"};
  }
`;

export const LegendItemRemoveIcon = styled(Icon)`
  color: var(--mb-color-text-light);
  cursor: pointer;
  margin-left: 0.5rem;

  &:hover {
    color: var(--mb-color-text-medium);
  }
`;

LegendItemRemoveIcon.defaultProps = {
  name: "close",
  size: 12,
};

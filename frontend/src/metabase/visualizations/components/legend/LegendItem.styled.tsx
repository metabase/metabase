// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const LegendItemRoot = styled.div<{ isVertical: boolean }>`
  display: flex;
  align-items: center;
  min-width: 0;

  &:not(:first-of-type) {
    margin-top: ${({ isVertical }) => (isVertical ? "0.25rem" : "")};
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

const LEGEND_ITEM_TITLE_MARGIN = 4;

export const LegendItemTitle = styled.div<{
  dotSize: string;
  isInsidePopover?: boolean;
}>`
  color: var(--mb-color-text-primary);
  font-size: 0.928em;
  font-weight: 700;
  margin-left: ${LEGEND_ITEM_TITLE_MARGIN}px;
  overflow: hidden;
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};
  max-width: ${({ dotSize, isInsidePopover }) =>
    isInsidePopover
      ? `calc(100% - ${dotSize}px - ${LEGEND_ITEM_TITLE_MARGIN}px)`
      : "unset"};

  &:hover {
    color: ${({ onClick }) => onClick && "var(--mb-color-brand)"};
  }
`;

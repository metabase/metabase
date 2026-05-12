// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { GAP_REM } from "metabase/collections/components/PinnedItemOverview/PinnedItemOverview.styled";
import { PinnedItemSortDropTarget } from "metabase/common/components/dnd/PinnedItemSortDropTarget";
import { color } from "metabase/ui/utils/colors";

export type PinDropTargetProps = {
  isBackTarget?: boolean;
  isFrontTarget?: boolean;
  itemModel: string;
  pinIndex?: number | null;
  enableDropTargetBackground?: boolean;
};

export type PinDropTargetRenderArgs = PinDropTargetProps & {
  hovered: boolean;
  highlighted: boolean;
};

export const StyledPinDropTarget = styled(
  PinnedItemSortDropTarget,
)<PinDropTargetProps>`
  position: absolute !important;
  top: 0;
  bottom: 0;
  left: -${(GAP_REM * 5) / 8}rem;
  right: -${(GAP_REM * 5) / 8}rem;
  pointer-events: none;
  background-color: transparent;

  * {
    pointer-events: all;
  }
`;

export const PinDropTargetIndicator = styled.div<PinDropTargetRenderArgs>`
  z-index: 1;
  position: absolute;
  top: 0;
  bottom: 0;
  inset-inline-start: 0;
  inset-inline-end: 0;
  border-inline-start: ${(props) =>
    props.isFrontTarget &&
    `4px solid ${
      props.hovered ? color("brand") : "var(--mb-color-background-tertiary)"
    }`};
  border-inline-end: ${(props) =>
    props.isBackTarget &&
    `4px solid ${
      props.hovered ? color("brand") : "var(--mb-color-background-tertiary)"
    }`};
  display: ${(props) => !(props.hovered || props.highlighted) && "none"};
`;

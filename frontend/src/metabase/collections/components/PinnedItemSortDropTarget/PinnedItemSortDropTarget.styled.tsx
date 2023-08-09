import styled from "@emotion/styled";

import PinnedItemSortDropTarget from "metabase/containers/dnd/PinnedItemSortDropTarget";
import { GAP_REM } from "metabase/collections/components/PinnedItemOverview/PinnedItemOverview.styled";
import { color } from "metabase/lib/colors";

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
  inset: 0 -${(GAP_REM * 5) / 8}rem 0 -${(GAP_REM * 5) / 8}rem;
  pointer-events: none;
  background-color: transparent;

  * {
    pointer-events: all;
  }
`;

export const PinDropTargetIndicator = styled.div<PinDropTargetRenderArgs>`
  z-index: 1;
  position: absolute;
  inset: 0;
  border-left: ${props =>
    props.isFrontTarget &&
    `4px solid ${props.hovered ? color("brand") : color("bg-medium")}`};
  border-right: ${props =>
    props.isBackTarget &&
    `4px solid ${props.hovered ? color("brand") : color("bg-medium")}`};
  display: ${props => !(props.hovered || props.highlighted) && "none"};
`;

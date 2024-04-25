import styled from "@emotion/styled";

import { GAP_REM } from "metabase/collections/components/PinnedItemOverview/PinnedItemOverview.styled";
import PinnedItemSortDropTarget from "metabase/containers/dnd/PinnedItemSortDropTarget";
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
  left: 0;
  right: 0;
  border-left: ${props =>
    props.isFrontTarget &&
    `4px solid ${props.hovered ? color("brand") : color("bg-medium")}`};
  border-right: ${props =>
    props.isBackTarget &&
    `4px solid ${props.hovered ? color("brand") : color("bg-medium")}`};
  display: ${props => !(props.hovered || props.highlighted) && "none"};
`;

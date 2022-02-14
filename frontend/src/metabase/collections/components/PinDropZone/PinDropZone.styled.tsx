import styled from "@emotion/styled";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import { color } from "metabase/lib/colors";

export type PinDropTargetProps = {
  variant: "pin" | "unpin";
  pinIndex: number | null;
  hideUntilDrag: boolean;
};

export type PinDropTargetRenderArgs = PinDropTargetProps & {
  hovered: boolean;
  highlighted: boolean;
  empty?: boolean;
};

export const StyledPinDropTarget = styled(PinDropTarget)<PinDropTargetProps>`
  position: absolute !important;
  top: 0;
  bottom: 0;
  left: -1rem;
  right: -1rem;
  pointer-events: none;
  background-color: transparent !important;

  * {
    pointer-events: all;
    background-color: transparent !important;
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
    `4px solid ${props.hovered ? color("brand") : color("bg-medium")}`};
  display: ${props => !(props.hovered || props.highlighted) && "none"};
  min-height: 2rem;
  transform: ${props => props.empty && "translateY(-1rem)"};
`;

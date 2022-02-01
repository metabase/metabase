import React from "react";
import PropTypes from "prop-types";

import {
  StyledPinDropTarget,
  PinDropTargetIndicator,
  PinDropTargetProps,
  PinDropTargetRenderArgs,
} from "./PinDropZone.styled";

type PinDropZoneProps = Pick<PinDropTargetProps, "variant">;

PinDropZone.propTypes = {
  variant: PropTypes.oneOf(["pin", "unpin"]).isRequired,
};

function PinDropZone({ variant, ...props }: PinDropZoneProps) {
  return (
    <StyledPinDropTarget
      variant={variant}
      pinIndex={variant === "pin" ? 1 : null}
      hideUntilDrag
      {...props}
    >
      {(args: PinDropTargetRenderArgs) => <PinDropTargetIndicator {...args} />}
    </StyledPinDropTarget>
  );
}

export default PinDropZone;

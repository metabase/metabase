import React from "react";
import PropTypes from "prop-types";

import {
  StyledPinDropTarget,
  PinDropTargetIndicator,
  PinDropTargetRenderArgs,
} from "./PinDropZone.styled";

type PinDropZoneProps = {
  variant: "pin" | "unpin";
  empty?: boolean;
};

PinDropZone.propTypes = {
  variant: PropTypes.oneOf(["pin", "unpin"]).isRequired,
  empty: PropTypes.bool,
};

function PinDropZone({ variant, empty, ...props }: PinDropZoneProps) {
  return (
    <StyledPinDropTarget
      variant={variant}
      pinIndex={variant === "pin" ? 1 : null}
      hideUntilDrag
      {...props}
    >
      {(args: PinDropTargetRenderArgs) => (
        <PinDropTargetIndicator empty={empty} {...args} />
      )}
    </StyledPinDropTarget>
  );
}

export default PinDropZone;

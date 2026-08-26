import type { PinDropTargetRenderArgs } from "./PinDropZone.styled";
import {
  PinDropTargetIndicator,
  StyledPinDropTarget,
} from "./PinDropZone.styled";

type PinDropZoneProps = {
  variant: "pin" | "unpin";
  empty?: boolean;
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinDropZone;

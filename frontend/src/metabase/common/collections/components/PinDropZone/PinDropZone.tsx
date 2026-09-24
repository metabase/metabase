import cx from "classnames";

import { PinDropTarget } from "metabase/common/components/dnd/PinDropTarget";
import { Box, rem } from "metabase/ui";

import S from "./PinDropZone.module.css";

type PinDropZoneProps = {
  variant: "pin" | "unpin";
  empty?: boolean;
};

type PinDropTargetRenderArgs = {
  hovered: boolean;
  highlighted: boolean;
};

function PinDropZone({ variant, empty, ...props }: PinDropZoneProps) {
  return (
    <PinDropTarget
      className={S.dropTarget}
      variant={variant}
      pinIndex={variant === "pin" ? 1 : null}
      hideUntilDrag
      {...props}
    >
      {({ hovered, highlighted }: PinDropTargetRenderArgs) => (
        <Box
          className={cx(S.indicator, {
            [S.hovered]: hovered,
            [S.empty]: empty,
          })}
          display={hovered || highlighted ? undefined : "none"}
          pos="absolute"
          top={0}
          bottom={0}
          left={0}
          right={0}
          mih={rem(32)}
        />
      )}
    </PinDropTarget>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinDropZone;

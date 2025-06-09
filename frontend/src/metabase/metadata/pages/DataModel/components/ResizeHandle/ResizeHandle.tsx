import { forwardRef } from "react";
import type { ResizableBoxProps } from "react-resizable";

import { Box, type BoxProps, rem } from "metabase/ui";

interface Props
  extends BoxProps,
    Omit<ResizableBoxProps, "style" | "onResize"> {
  handleAxis?: string; // undocumented prop https://github.com/react-grid-layout/react-resizable/issues/175
  handlePosition: "left" | "right";
}

export const ResizeHandle = forwardRef<HTMLDivElement, Props>(function Handle(
  { handleAxis, handlePosition, ...props },
  ref,
) {
  const handleWidth = 10;
  const borderWidth = 1;
  const offset = -((handleWidth + borderWidth) / 2);

  return (
    <Box
      bottom={0}
      left={handlePosition === "left" ? rem(offset) : undefined}
      m="auto 0"
      pos="absolute"
      ref={ref}
      right={handlePosition === "right" ? rem(offset) : undefined}
      style={{
        cursor: "ew-resize",
        zIndex: 5,
      }}
      top={0}
      w={rem(handleWidth)}
      {...props}
    />
  );
});

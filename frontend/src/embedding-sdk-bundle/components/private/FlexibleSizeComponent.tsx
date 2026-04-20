import { type CSSProperties, type PropsWithChildren, forwardRef } from "react";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { Box } from "metabase/ui";

export const FLEXIBLE_SIZE_DEFAULT_HEIGHT = "600px";
export const FLEXIBLE_SIZE_DEFAULT_WIDTH = "100%";

/**
 * @inline
 */
export type FlexibleSizeProps = PropsWithChildren<
  CommonStylingProps & {
    /**
     * A number or string specifying a CSS size value that specifies the width of the component
     */
    width?: CSSProperties["width"];

    /**
     * A number or string specifying a CSS size value that specifies the height of the component
     */
    height?: CSSProperties["height"];
  }
>;

export const FlexibleSizeComponent = forwardRef<
  HTMLDivElement,
  FlexibleSizeProps
>(function FlexibleSizeComponent(
  {
    height: propHeight = FLEXIBLE_SIZE_DEFAULT_HEIGHT,
    width: propWidth = FLEXIBLE_SIZE_DEFAULT_WIDTH,
    className,
    style,
    children,
  },
  ref,
) {
  return (
    <Box h={propHeight} w={propWidth} mih={propHeight} miw={propWidth}>
      <Box
        ref={ref}
        h="100%"
        w="100%"
        mih="100%"
        miw="100%"
        style={style}
        className={className}
      >
        {children}
      </Box>
    </Box>
  );
});

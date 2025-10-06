import type { CSSProperties, PropsWithChildren } from "react";

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

export const FlexibleSizeComponent = ({
  height: propHeight = FLEXIBLE_SIZE_DEFAULT_HEIGHT,
  width: propWidth = FLEXIBLE_SIZE_DEFAULT_WIDTH,
  className,
  style,
  children,
}: FlexibleSizeProps) => (
  <Box h={propHeight} w={propWidth} mih={propHeight} miw={propWidth}>
    <Box
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

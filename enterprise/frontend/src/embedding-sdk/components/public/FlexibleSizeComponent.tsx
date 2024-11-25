import type { CSSProperties, PropsWithChildren } from "react";

import { Box } from "metabase/ui";

export type FlexibleSizeProps = PropsWithChildren<{
  height?: CSSProperties["height"];
  width?: CSSProperties["width"];
  className?: string;
  style?: CSSProperties;
}>;

export const FlexibleSizeComponent = ({
  height: propHeight = "600px",
  width: propWidth = "100%",
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

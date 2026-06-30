import type { ReactNode } from "react";

import { Box, type BoxProps } from "metabase/ui";

type MonitorHeaderTitleProps = BoxProps & {
  children?: ReactNode;
};

export function MonitorHeaderTitle({
  children,
  ...props
}: MonitorHeaderTitleProps) {
  return (
    <Box {...props} fz="sm" c="text-secondary">
      {children}
    </Box>
  );
}

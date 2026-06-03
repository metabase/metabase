import type { ReactNode } from "react";

import { Box } from "metabase/ui";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

/**
 * Data Studio no longer owns its own sidebar — the unified main navbar provides
 * the "Data Studio" tab. This layout is now just a full-height content wrapper
 * so Data Studio pages render inside the shared AppContentShell.
 */
export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  return (
    <Box h="100%" w="100%" miw={0}>
      {children}
    </Box>
  );
}

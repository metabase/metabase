import { type ReactNode, memo } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Box } from "metabase/ui";

export const CONTENT_PADDING_X = "3.5rem";

type AreaContentProps = {
  children?: ReactNode;
  /** Drops the content padding so a page can use the whole area, for editors
   * that put a panel and a live preview side by side. Mirrors `fullWidth` on
   * `AdminSettingsLayout`. */
  fullWidth?: boolean;
};

export const AreaContent = memo(function AreaContent({
  children,
  fullWidth = false,
}: AreaContentProps) {
  return (
    <Box
      h="100%"
      px={fullWidth ? 0 : CONTENT_PADDING_X}
      py={fullWidth ? 0 : "1.5rem"}
      style={{ overflowY: "auto" }}
    >
      <ErrorBoundary>{children}</ErrorBoundary>
    </Box>
  );
});

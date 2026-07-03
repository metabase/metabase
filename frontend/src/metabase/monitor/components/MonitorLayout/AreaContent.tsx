import { type ReactNode, memo } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Box } from "metabase/ui";

export const CONTENT_PADDING_X = "3.5rem";
const CONTENT_PADDING_RIGHT_WITH_APP_SWITCHER = "7rem";

type AreaContentProps = {
  children?: ReactNode;
};

export const AreaContent = memo(function AreaContent({
  children,
}: AreaContentProps) {
  return (
    <Box
      h="100%"
      pl={CONTENT_PADDING_X}
      pr={CONTENT_PADDING_RIGHT_WITH_APP_SWITCHER}
      py="1.5rem"
      style={{ overflowY: "auto" }}
    >
      <ErrorBoundary>{children}</ErrorBoundary>
    </Box>
  );
});

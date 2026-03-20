import type { ReactNode } from "react";

import { Box } from "metabase/ui";

export const ProFeatureGate = ({
  isGated,
  children,
}: {
  isGated: boolean;
  children: ReactNode;
}) => {
  if (!isGated) {
    return children;
  }

  return (
    <Box style={{ cursor: "not-allowed" }}>
      <Box style={{ pointerEvents: "none" }}>{children}</Box>
    </Box>
  );
};

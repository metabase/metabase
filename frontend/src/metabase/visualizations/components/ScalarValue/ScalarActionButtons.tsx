import type { PropsWithChildren } from "react";

import { Box } from "metabase/ui";

import type { ScalarSizeTier } from "./sizing";

export const ScalarActionButtons = ({
  children,
  tier,
}: PropsWithChildren<{ tier: ScalarSizeTier }>) => {
  if (!children) {
    return null;
  }
  return (
    <Box
      pos="absolute"
      style={{ zIndex: 1 }}
      top={tier.menuOffset.top}
      right={tier.menuOffset.right}
      data-testid="scalar-action-buttons"
    >
      {children}
    </Box>
  );
};

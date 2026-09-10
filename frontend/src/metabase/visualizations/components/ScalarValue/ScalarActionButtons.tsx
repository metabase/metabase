import type { HTMLAttributes, PropsWithChildren } from "react";

import { Box } from "metabase/ui";

import type { ScalarSizeTier } from "./sizing";

export const ScalarActionButtons = ({
  children,
  tier,
  ...props
}: PropsWithChildren<{ tier: ScalarSizeTier }> &
  HTMLAttributes<HTMLDivElement>) => {
  if (!children) {
    return null;
  }
  return (
    <Box
      pos="absolute"
      top={tier.menuOffset.top}
      right={tier.menuOffset.right}
      data-testid="scalar-action-buttons"
      {...props}
    >
      {children}
    </Box>
  );
};

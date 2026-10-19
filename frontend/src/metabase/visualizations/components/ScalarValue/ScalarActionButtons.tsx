import type { PropsWithChildren } from "react";

import { Box } from "metabase/ui";

import type { ScalarSizeTier } from "./sizing";

interface ScalarActionButtonsProps {
  tier: ScalarSizeTier;
  position?: "left" | "right";
}

export const ScalarActionButtons = ({
  children,
  tier,
  position = "right",
}: PropsWithChildren<ScalarActionButtonsProps>) => {
  if (!children) {
    return null;
  }
  return (
    <Box
      pos="absolute"
      style={{ zIndex: 1 }}
      top={tier.menuOffset.top}
      left={position === "left" ? tier.menuOffset.right : undefined}
      right={position === "right" ? tier.menuOffset.right : undefined}
      data-testid={
        position === "left"
          ? "scalar-card-level-filters"
          : "scalar-action-buttons"
      }
    >
      {children}
    </Box>
  );
};

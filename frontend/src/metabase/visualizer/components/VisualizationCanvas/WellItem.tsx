import { forwardRef } from "react";

import { Box, type BoxProps } from "metabase/ui";

export type WellItemProps = BoxProps;

export const WellItem = forwardRef<HTMLDivElement, WellItemProps>(
  function WellItem({ style, ...props }, ref) {
    return (
      <Box
        bg="var(--mb-color-bg-white)"
        px="sm"
        {...props}
        style={{
          ...style,
          borderRadius: "var(--border-radius-xl)",
          border: `1px solid var(--mb-color-border)`,
          boxShadow: "0 0 1px var(--mb-color-shadow)",
        }}
        ref={ref}
      />
    );
  },
);

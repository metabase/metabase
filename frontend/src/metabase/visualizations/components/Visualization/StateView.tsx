import { forwardRef } from "react";

import { Stack, type StackProps } from "metabase/ui";

/** Centered container shared by the loading, error, and no-results views. */
export const StateView = forwardRef<HTMLDivElement, StackProps>(
  function StateView(props, ref) {
    return (
      <Stack
        ref={ref}
        gap={0}
        align="center"
        justify="center"
        flex="1 0 auto"
        ta="center"
        px="sm"
        pb="sm"
        {...props}
      />
    );
  },
);

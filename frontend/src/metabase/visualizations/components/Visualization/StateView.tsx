import { forwardRef } from "react";

import { Flex, type FlexProps } from "metabase/ui";

/** Centered container shared by the loading, error, and no-results views. */
export const StateView = forwardRef<HTMLDivElement, FlexProps>(
  function StateView(props, ref) {
    return (
      <Flex
        ref={ref}
        direction="column"
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

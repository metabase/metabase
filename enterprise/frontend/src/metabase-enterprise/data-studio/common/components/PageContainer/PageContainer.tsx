import React from "react";

import { Stack, type StackProps } from "metabase/ui";

export const PageContainer = React.forwardRef(function PageContainerInner(
  { children, ...rest }: React.PropsWithChildren<StackProps>,
  ref: React.Ref<HTMLDivElement>,
) {
  return (
    <Stack
      bg="background-secondary"
      h="100%"
      pb="2rem"
      px="3.5rem"
      gap="xl"
      style={{ overflow: "auto" }}
      ref={ref}
      {...rest}
    >
      {children}
    </Stack>
  );
});

import type React from "react";

import { Stack, type StackProps } from "metabase/ui";

export const PageContainer = ({
  children,
  ...rest
}: React.PropsWithChildren<StackProps>) => {
  return (
    <Stack
      bg="background-secondary"
      h="100%"
      pb="2rem"
      px="3.5rem"
      gap="xl"
      style={{ overflow: "auto" }}
      {...rest}
    >
      {children}
    </Stack>
  );
};

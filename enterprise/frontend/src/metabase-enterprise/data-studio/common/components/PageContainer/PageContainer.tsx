import type React from "react";

import { Stack, type StackProps } from "metabase/ui";

export const PageContainer = ({
  header,
  children,
  ...rest
}: React.PropsWithChildren<{ header?: React.ReactNode } & StackProps>) => {
  return (
    <Stack
      bg="background-light"
      h="100%"
      pb="2rem"
      px="3.5rem"
      style={{ overflow: "auto" }}
      {...rest}
    >
      {header}
      {children}
    </Stack>
  );
};

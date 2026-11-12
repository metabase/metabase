import type { ReactNode } from "react";

import { Stack, type StackProps } from "metabase/ui";

interface AboutSidebarProps extends StackProps {
  children: ReactNode;
}

export function AboutSidebar({ children, ...stackProps }: AboutSidebarProps) {
  return (
    <Stack p="lg" gap={0} align="stretch" {...stackProps}>
      {children}
    </Stack>
  );
}

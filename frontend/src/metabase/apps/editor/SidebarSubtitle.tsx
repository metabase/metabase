import type { PropsWithChildren } from "react";

import { Text } from "metabase/ui";

export function SidebarSubtitle({ children }: PropsWithChildren) {
  return (
    <Text fw={700} fz="sm" lts={1} lh={1} tt="uppercase" c="text-secondary">
      {children}
    </Text>
  );
}

import type { ReactNode } from "react";

import { Box } from "metabase/ui";

type SidebarCardProps = {
  children: ReactNode;
};

/** Bordered card for free-form section content, framed like a DetailsTable */
export const SidebarCard = ({ children }: SidebarCardProps) => (
  <Box bd="1px solid var(--mb-color-border-neutral)" bdrs="lg" p="sm">
    {children}
  </Box>
);

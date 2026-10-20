import type { ReactNode } from "react";

import { Group } from "metabase/ui";

import S from "./SidebarFooter.module.css";

export const SidebarFooter = ({ children }: { children: ReactNode }) => (
  <Group className={S.footer} gap="sm" grow>
    {children}
  </Group>
);

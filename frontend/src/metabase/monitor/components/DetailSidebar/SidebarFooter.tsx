import type { ReactNode } from "react";

import { Group } from "metabase/ui";

import S from "./SidebarFooter.module.css";

/** The actions pinned to the bottom of a Monitor detail sidebar, outside its scrolling body. */
export const SidebarFooter = ({ children }: { children: ReactNode }) => (
  <Group className={S.footer} gap="sm" grow>
    {children}
  </Group>
);

import type { ReactNode } from "react";

import {
  SidebarHeading,
  SidebarSection,
} from "../MainNavbar/MainNavbar.styled";

export function SubNavSection({ children }: { children: ReactNode }) {
  return <SidebarSection>{children}</SidebarSection>;
}

export function SubNavHeading({ children }: { children: ReactNode }) {
  return <SidebarHeading>{children}</SidebarHeading>;
}

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import ErrorBoundary from "metabase/ErrorBoundary";

import { useMonitorSidebarContext } from "./MonitorContent";

type SidebarProps = {
  children: ReactNode;
};

/**
 * Portal for Monitor views' sidebar outlet.
 */
export function Sidebar({ children }: SidebarProps) {
  const { sidebarNode } = useMonitorSidebarContext();

  if (sidebarNode == null) {
    return null;
  }

  return createPortal(<ErrorBoundary>{children}</ErrorBoundary>, sidebarNode);
}

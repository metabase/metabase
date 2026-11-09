import type { ReactNode } from "react";

import { SidebarContent } from "metabase/common/components/SidebarContent";

export function ExpressionSidebarPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarContent
      title={title}
      onClose={onClose}
      data-testid="expression-sidebar-panel"
    >
      {children}
    </SidebarContent>
  );
}

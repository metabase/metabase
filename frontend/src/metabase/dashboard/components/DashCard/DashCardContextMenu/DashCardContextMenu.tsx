import type { ReactNode } from "react";
import { ContextMenu } from "metabase/ui/components/overlays/ContextMenu";

export function DashCardContextMenu({ children }: { children: ReactNode }) {
  return (
    <ContextMenu
      menuItems={[
        {
          name: "test",
          onSelect: () => null,
        },
      ]}
    >
      {children}
    </ContextMenu>
  );
}

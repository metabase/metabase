import type { ReactNode } from "react";

import { useDispatch } from "metabase/lib/redux";
import { ContextMenu } from "metabase/ui/components/overlays/ContextMenu";
import { updateDashboardAndCards } from "metabase/dashboard/actions";

export function DashCardContextMenu({
  onRemove,
  children,
}: {
  onRemove: () => void;
  children: ReactNode;
}) {
  const dispatch = useDispatch();

  return (
    <ContextMenu
      menuItems={[
        {
          name: "Delete",
          onSelect: () => {
            onRemove();
            // TODO remove hack and actually fix race condition where `isRemoved` is not yet `true`
            setTimeout(() => dispatch(updateDashboardAndCards()), 50);
          },
        },
      ]}
    >
      {children}
    </ContextMenu>
  );
}

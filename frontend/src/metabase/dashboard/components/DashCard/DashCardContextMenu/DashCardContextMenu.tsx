import type { ReactNode } from "react";

import { useDispatch } from "metabase/lib/redux";
import { ContextMenu } from "metabase/ui/components/overlays/ContextMenu";
import {
  setEditingDashboard,
  updateDashboardAndCards,
} from "metabase/dashboard/actions";
import type { Dashboard } from "metabase-types/api";

export function DashCardContextMenu({
  dashboard,
  onRemove,
  onReplaceCard,
  children,
}: {
  dashboard: Dashboard;
  onRemove: () => void;
  onReplaceCard: () => void;
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
        {
          name: "Replace",
          onSelect: () => {
            dispatch(setEditingDashboard(dashboard));
            onReplaceCard();
          },
        },
      ]}
    >
      {children}
    </ContextMenu>
  );
}

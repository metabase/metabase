import { useMemo, type ReactNode, useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { ContextMenu } from "metabase/ui/components/overlays/ContextMenu";
import {
  moveDashCardToTab,
  setEditingDashboard,
  updateDashboardAndCards,
} from "metabase/dashboard/actions";
import type { Dashboard, DashboardCard } from "metabase-types/api";
import { getSelectedTabId, getTabs } from "metabase/dashboard/selectors";

export function DashCardContextMenu({
  dashboard,
  dashcard,
  onRemove,
  onReplaceCard,
  children,
}: {
  dashboard: Dashboard;
  dashcard: DashboardCard;
  onRemove: () => void;
  onReplaceCard: () => void;
  children: ReactNode;
}) {
  const dispatch = useDispatch();

  // TODO remove hack and actually fix race condition where `isRemoved` is not yet `true`
  const saveDashboard = () =>
    setTimeout(() => dispatch(updateDashboardAndCards()), 50);

  // TODO consolodate code with DashCardTabMenu
  const tabs = useSelector(getTabs);
  const selectedTabId = useSelector(getSelectedTabId);

  const tabsToShow = useMemo(() => {
    return tabs.filter(t => t.id !== selectedTabId);
  }, [selectedTabId, tabs]);

  const moveDashcard = useCallback(
    (destinationTabId: number) => {
      dispatch(
        moveDashCardToTab({ dashCardId: dashcard.id, destinationTabId }),
      );
    },
    [dashcard.id, dispatch],
  );

  return (
    <ContextMenu
      menuItems={[
        {
          name: "Delete",
          onSelect: () => {
            onRemove();
            saveDashboard();
          },
        },
        {
          name: "Replace",
          onSelect: () => {
            dispatch(setEditingDashboard(dashboard));
            onReplaceCard();
          },
        },
        {
          // TODO hide if no tabs to show
          name: "Move to Tab",
          children: tabsToShow.map(tab => ({
            name: tab.name,
            onSelect: () => {
              moveDashcard(tab.id);
              saveDashboard();
            },
          })),
        },
      ]}
    >
      {children}
    </ContextMenu>
  );
}

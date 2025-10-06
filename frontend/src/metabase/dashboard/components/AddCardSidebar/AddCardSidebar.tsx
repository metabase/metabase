import { useCallback } from "react";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import type { CardId } from "metabase-types/api";

import { QuestionPicker } from "../QuestionPicker";

export function AddCardSidebar() {
  const { dashboard, selectedTabId, addCardToDashboard, closeSidebar } =
    useDashboardContext();

  const handleAddCard = useCallback(
    (cardId: CardId) => {
      if (dashboard) {
        addCardToDashboard({
          dashId: dashboard.id,
          cardId: cardId,
          tabId: selectedTabId,
        });
      }
    },
    [addCardToDashboard, dashboard, selectedTabId],
  );

  return (
    <Sidebar data-testid="add-card-sidebar">
      <QuestionPicker onSelect={handleAddCard} onClose={closeSidebar} />
    </Sidebar>
  );
}

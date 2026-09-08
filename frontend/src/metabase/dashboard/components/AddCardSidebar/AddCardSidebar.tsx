import { useCallback } from "react";

import type { CardId } from "metabase-types/api";
import { Sidebar } from "metabase/common/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";

import { QuestionPicker } from "../QuestionPicker";

export function AddCardSidebar() {
  const { dashboard, selectedTabId, addCardToDashboard } =
    useDashboardContext();

  const handleAddCard = useCallback(
    (cardId: string | number) => {
      if (dashboard) {
        addCardToDashboard({
          dashId: dashboard.id,
          // Unjustified type cast. FIXME
          cardId: cardId as CardId,
          tabId: selectedTabId,
        });
      }
    },
    [addCardToDashboard, dashboard, selectedTabId],
  );

  return (
    <Sidebar data-testid="add-card-sidebar">
      <QuestionPicker onSelect={handleAddCard} />
    </Sidebar>
  );
}

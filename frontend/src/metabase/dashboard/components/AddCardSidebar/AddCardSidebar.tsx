import { useCallback } from "react";

import { Sidebar } from "metabase/common/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import type { CardId } from "metabase-types/api";

import { QuestionPicker } from "../QuestionPicker";

export function AddCardSidebar() {
  const { dashboard, selectedTabId, addCardToDashboard } =
    useDashboardContext();

  const handleAddCard = useCallback(
    (cardId: string | number) => {
      if (dashboard) {
        addCardToDashboard({
          dashId: dashboard.id,
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

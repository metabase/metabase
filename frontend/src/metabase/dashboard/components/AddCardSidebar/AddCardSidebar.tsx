import { useCallback } from "react";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import type { CardId } from "metabase-types/api";

import { QuestionPicker } from "../QuestionPicker";

export function AddCardSidebar() {
  const {
    dashboard,
    selectedTabId,
    addCardToDashboard,
    closeSidebar,
    addMarkdownDashCardToDashboard,
  } = useDashboardContext();

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

  const handleAddImage = useCallback(
    (imageId: CardId) => {
      if (dashboard) {
        addMarkdownDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
          markdownContent: `![Image](/api/images/${imageId}/contents)`,
          size_x: 6,
          size_y: 6,
        });
      }
    },
    [addMarkdownDashCardToDashboard, dashboard, selectedTabId],
  );
  return (
    <Sidebar data-testid="add-card-sidebar">
      <QuestionPicker
        onSelect={handleAddCard}
        onSelectImage={handleAddImage}
        onClose={closeSidebar}
      />
    </Sidebar>
  );
}

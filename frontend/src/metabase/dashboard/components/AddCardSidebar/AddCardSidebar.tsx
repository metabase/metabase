import { Sidebar } from "metabase/dashboard/components/Sidebar";
import type { CardId } from "metabase-types/api";

import { QuestionPicker } from "../QuestionPicker";

interface AddCardSidebarProps {
  onSelect: (cardId: CardId) => void;
  onClose: () => void;
}

export function AddCardSidebar(props: AddCardSidebarProps) {
  return (
    <Sidebar data-testid="add-card-sidebar">
      <QuestionPicker {...props} />
    </Sidebar>
  );
}

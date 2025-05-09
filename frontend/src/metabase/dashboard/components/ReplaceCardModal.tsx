import type React from "react";
import { t } from "ttag";
import type { QuestionPickerValueItem } from "metabase/common/components/QuestionPicker";
import {
  QuestionPickerModal,
  getQuestionPickerValue,
} from "metabase/common/components/QuestionPicker";

import type {
  BaseDashboardCard,
  Card,
  Dashboard,
  RecentItem,
} from "metabase-types/api";
import { isRecentCollectionItem } from "metabase-types/api";

// Helper for undo message
const getUndoReplaceCardMessage = ({ type }: Pick<Card, "type">) => {
  if (type === "model") {
    return t`Model replaced`;
  }
  if (type === "metric") {
    return t`Metric replaced`;
  }
  if (type === "question") {
    return t`Question replaced`;
  }
  throw new Error(`Unknown card.type: ${type}`);
};

export type ReplaceCardModalProps = {
  isOpen: boolean;
  dashcard: BaseDashboardCard | null;
  dashboard: Dashboard;
  onClose: () => void;
  onReplace: (opts: { dashcardId: number; nextCardId: number }) => void;
  onUndo: (opts: {
    message: string;
    undo: boolean;
    action: () => void;
  }) => void;
  setDashCardAttributes: (opts: { id: number; attributes: any }) => void;
};

export const ReplaceCardModal: React.FC<ReplaceCardModalProps> = ({
  isOpen,
  dashcard,
  dashboard,
  onClose,
  onReplace,
  onUndo,
  setDashCardAttributes,
}) => {
  const hasValidDashCard = !!dashcard && dashcard.card && dashcard.card.id;

  const handleSelect = (nextCard: QuestionPickerValueItem) => {
    if (!hasValidDashCard || !dashcard) {
      return;
    }
    onReplace({ dashcardId: dashcard.id, nextCardId: nextCard.id });
    if (dashcard.card && dashcard.card.type) {
      onUndo({
        message: getUndoReplaceCardMessage({ type: dashcard.card.type }),
        undo: true,
        action: () =>
          setDashCardAttributes({
            id: dashcard.id,
            attributes: dashcard,
          }),
      });
    }
    onClose();
  };

  const replaceCardModalRecentFilter = (items: RecentItem[]) => {
    return items.filter((item) => {
      if (isRecentCollectionItem(item) && item.dashboard) {
        if (item.dashboard.id !== dashboard.id) {
          return false;
        }
      }
      return true;
    });
  };

  if (!isOpen || !hasValidDashCard || !dashcard) {
    return null;
  }

  let questionPickerValue:
    | ReturnType<typeof getQuestionPickerValue>
    | undefined = undefined;
  if (dashcard.card && dashcard.card.id && dashcard.card.type) {
    questionPickerValue = getQuestionPickerValue(dashcard.card as Card);
  }

  return (
    <QuestionPickerModal
      title={t`Pick what you want to replace this with`}
      value={questionPickerValue}
      models={["card", "dataset", "metric"]}
      onChange={handleSelect}
      onClose={onClose}
      recentFilter={replaceCardModalRecentFilter}
    />
  );
};

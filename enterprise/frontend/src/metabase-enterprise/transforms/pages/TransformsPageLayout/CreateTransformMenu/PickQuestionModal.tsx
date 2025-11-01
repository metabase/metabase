import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker";
import type { CardId } from "metabase-types/api";

interface PickQuestionModalProps {
  onSelect: (cardId: CardId) => void;
  onClose: () => void;
}

export const PickQuestionModal = ({
  onSelect,
  onClose,
}: PickQuestionModalProps) => {
  return (
    <QuestionPickerModal
      title={t`Pick a question`}
      models={["card"]}
      onChange={(item) => {
        if (item.model === "card") {
          onSelect(item.id as CardId);
        }
      }}
      onClose={onClose}
    />
  );
};

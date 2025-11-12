import { useMemo } from "react";

import Question from "metabase-lib/v1/Question";

import { NativeQueryModal } from "../shared/NativeQueryModal";

interface CreateQuestionModalProps {
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

export const CreateNativeQuestionModal = ({
  onSave,
  onClose,
}: CreateQuestionModalProps) => {
  const question = useMemo(
    () =>
      Question.create({
        DEPRECATED_RAW_MBQL_type: "native",
      }),
    [],
  );

  const handleSaveNativeQuestion = async ({ card_id }: { card_id: number }) => {
    onSave(card_id, "New SQL query");
    onClose();
  };

  return (
    <NativeQueryModal
      isOpen
      card={question.card()}
      onSave={handleSaveNativeQuestion}
      onClose={onClose}
    />
  );
};

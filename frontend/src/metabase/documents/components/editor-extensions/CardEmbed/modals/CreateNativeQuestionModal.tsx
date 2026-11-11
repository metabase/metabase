import { useMemo } from "react";

import { useQuestionFromOptsBuilder } from "metabase/metadata-store";

import { NativeQueryModal } from "./NativeQueryModal";

interface CreateQuestionModalProps {
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

export const CreateNativeQuestionModal = ({
  onSave,
  onClose,
}: CreateQuestionModalProps) => {
  const buildQuestion = useQuestionFromOptsBuilder();
  const question = useMemo(
    () => buildQuestion({ DEPRECATED_RAW_MBQL_type: "native" }),
    [buildQuestion],
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

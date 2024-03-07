import { useCallback } from "react";
import { t } from "ttag";

import type { ModalProps } from "metabase/ui";
import { Box, Modal } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import { QuestionPicker } from "../QuestionPicker";

interface QuestionPickerModalProps
  extends Omit<ModalProps, "title" | "onSelect"> {
  onSelect: (cardId: CardId) => void;
}

export function QuestionPickerModal({
  onClose,
  onSelect,
  ...props
}: QuestionPickerModalProps) {
  const handleSelect = useCallback(
    (cardId: CardId) => {
      onSelect(cardId);
      onClose();
    },
    [onClose, onSelect],
  );

  return (
    <Modal.Root {...props} size="md" onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t`Replace with…`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p="0">
          <Box h="600px" style={{ overflowY: "auto" }}>
            <QuestionPicker onSelect={handleSelect} />
          </Box>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

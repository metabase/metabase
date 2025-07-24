import { t } from "ttag";

import { Flex, Modal } from "metabase/ui";

import { NewTransformFromQuestionForm } from "./NewTransformFromQuestionForm";

type NewTransformFromQuestionModalProps = {
  isOpened: boolean;
  onClose: () => void;
};

export function NewTransformFromQuestionModal({
  isOpened,
  onClose,
}: NewTransformFromQuestionModalProps) {
  return (
    <Modal.Root padding="2.5rem" opened={isOpened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t`New transform`}</Modal.Title>
          <Flex align="center" justify="flex-end" gap="sm">
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body>
          <NewTransformFromQuestionForm />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

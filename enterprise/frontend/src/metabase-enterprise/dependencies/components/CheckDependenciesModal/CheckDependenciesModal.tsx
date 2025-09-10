import type { CheckDependenciesModalProps } from "metabase/plugins";
import { Flex, Modal } from "metabase/ui";

import { CheckDependenciesForm } from "../CheckDependenciesForm";
import { CheckDependenciesTitle } from "../CheckDependenciesTitle";

export function CheckDependenciesModal({
  checkData,
  opened,
  onSave,
  onClose,
}: CheckDependenciesModalProps) {
  return (
    <Modal.Root size="xl" padding="xl" opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header px="xl">
          <Modal.Title>
            <CheckDependenciesTitle />
          </Modal.Title>
          <Flex justify="flex-end">
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body px={0}>
          <CheckDependenciesForm
            checkData={checkData}
            onSave={onSave}
            onCancel={onClose}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

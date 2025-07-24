import { t } from "ttag";

import { Flex, Modal } from "metabase/ui";
import type { DatasetQuery } from "metabase-types/api";

import { NewTransformForm } from "./NewTransformForm";

type NewTransformModalProps = {
  query: DatasetQuery;
  isOpened: boolean;
  onClose: () => void;
};

export function NewTransformModal({
  query,
  isOpened,
  onClose,
}: NewTransformModalProps) {
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
          <NewTransformForm query={query} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

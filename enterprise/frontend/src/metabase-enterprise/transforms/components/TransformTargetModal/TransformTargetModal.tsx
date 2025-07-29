import { t } from "ttag";

import { Flex, Modal } from "metabase/ui";
import type { DatabaseId, TransformTarget } from "metabase-types/api";

import { TransformTargetForm } from "./TransformTargetForm";

type TransformTargetModalProps = {
  databaseId: DatabaseId;
  target?: TransformTarget;
  isOpened: boolean;
  onSubmit: (target: TransformTarget) => void;
  onClose: () => void;
};

export function TransformTargetModal({
  databaseId,
  target,
  isOpened,
  onSubmit,
  onClose,
}: TransformTargetModalProps) {
  return (
    <Modal.Root padding="2.5rem" opened={isOpened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{getTitle(target)}</Modal.Title>
          <Flex align="center" justify="flex-end" gap="sm">
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body>
          <TransformTargetForm
            databaseId={databaseId}
            target={target}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function getTitle(target?: TransformTarget) {
  return target ? t`Change the target for this transform` : t`New transform`;
}

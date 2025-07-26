import { t } from "ttag";

import { Flex, Modal } from "metabase/ui";
import type { DatasetQuery } from "metabase-types/api";

import { NewTransformForm } from "./NewTransformForm";

type NewTransformSource = "question" | "model";

type NewTransformModalProps = {
  query: DatasetQuery;
  source?: NewTransformSource;
  isOpened?: boolean;
  onClose: () => void;
};

export function NewTransformModal({
  query,
  source,
  isOpened = true,
  onClose,
}: NewTransformModalProps) {
  return (
    <Modal.Root padding="2.5rem" opened={isOpened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{getTitle(source)}</Modal.Title>
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

function getTitle(source?: NewTransformSource) {
  switch (source) {
    case "question":
      return t`New transform from a question`;
    case "model":
      return t`New transform from a model`;
    default:
      return t`New transform`;
  }
}

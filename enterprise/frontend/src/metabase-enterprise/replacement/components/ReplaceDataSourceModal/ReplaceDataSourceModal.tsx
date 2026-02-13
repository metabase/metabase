import { useState } from "react";

import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import type {
  ReplaceSourceEntry,
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import { ModalBody } from "./ModalBody";
import { ModalFooter } from "./ModalFooter";
import { ModalHeader } from "./ModalHeader";

export function ReplaceDataSourceModal({
  initialSource,
  initialTarget,
  isOpened,
  onClose,
}: ReplaceDataSourceModalProps) {
  return (
    <Modal.Root opened={isOpened} fullScreen onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <FocusTrap.InitialFocus />
        <ModalContent
          initialSource={initialSource}
          initialTarget={initialTarget}
          onClose={onClose}
        />
      </Modal.Content>
    </Modal.Root>
  );
}

type ModalContentProps = {
  initialSource: ReplaceSourceEntry | undefined;
  initialTarget: ReplaceSourceEntry | undefined;
  onClose: () => void;
};

function ModalContent({
  initialSource,
  initialTarget,
  onClose,
}: ModalContentProps) {
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(initialTarget);
  const errors: ReplaceSourceError[] = [];
  const errorType: ReplaceSourceErrorType | undefined = "missing-column";

  return (
    <Flex h="100%" direction="column">
      <ModalHeader
        source={source}
        target={target}
        errors={errors}
        errorType={errorType}
        onSourceChange={setSource}
        onTargetChange={setTarget}
        onErrorTypeChange={() => {}}
      />
      <ModalBody errors={errors} errorType={errorType} />
      <ModalFooter errors={errors} onClose={onClose} />
    </Flex>
  );
}

import { useLayoutEffect, useState } from "react";

import { skipToken } from "metabase/api";
import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import { useCheckReplaceSourceQuery } from "metabase-enterprise/api";
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

const EMPTY_ERRORS: ReplaceSourceError[] = [];

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
  const [errorType, setErrorType] = useState<ReplaceSourceErrorType>();

  const { data, isFetching: isChecking } = useCheckReplaceSourceQuery(
    getCheckReplaceSourceRequest(source, target),
  );
  const errors = data?.errors ?? EMPTY_ERRORS;

  useLayoutEffect(() => {
    setErrorType(errors[0]?.type);
  }, [errors]);

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
      <ModalFooter errors={errors} isChecking={isChecking} onClose={onClose} />
    </Flex>
  );
}

function getCheckReplaceSourceRequest(
  source: ReplaceSourceEntry | undefined,
  target: ReplaceSourceEntry | undefined,
) {
  if (source == null || target == null) {
    return skipToken;
  }
  return {
    source_entity_id: source.id,
    source_entity_type: source.type,
    target_entity_id: target.id,
    target_entity_type: target.type,
  };
}

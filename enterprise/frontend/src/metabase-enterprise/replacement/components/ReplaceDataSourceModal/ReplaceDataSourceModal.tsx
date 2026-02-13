import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import {
  useCheckReplaceSourceQuery,
  useReplaceSourceMutation,
} from "metabase-enterprise/api";
import type {
  ReplaceSourceEntry,
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
  const [errorType, setErrorType] = useState<ReplaceSourceErrorType>();

  const { data, isFetching: isChecking } = useCheckReplaceSourceQuery(
    getCheckReplaceSourceRequest(source, target),
  );
  const [replaceSource, { isLoading: isReplacing }] =
    useReplaceSourceMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const errors = useMemo(() => {
    return data?.errors ?? [];
  }, [data]);

  useLayoutEffect(() => {
    setErrorType(errors[0]?.type);
  }, [errors]);

  const handleReplace = async () => {
    if (source == null || target == null) {
      return;
    }
    const { error } = await replaceSource({
      source_entity_id: source.id,
      source_entity_type: source.type,
      target_entity_id: target.id,
      target_entity_type: target.type,
    });
    if (error) {
      sendErrorToast(t`Failed to replace data source`);
    } else {
      sendSuccessToast(t`Data source replaced`);
    }
  };

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
      <ModalFooter
        errors={errors}
        isChecking={isChecking}
        isReplacing={isReplacing}
        onReplace={handleReplace}
        onClose={onClose}
      />
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

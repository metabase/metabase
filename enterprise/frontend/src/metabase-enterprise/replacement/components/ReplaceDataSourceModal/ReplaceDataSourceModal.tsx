import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import { useGetCardQuery, useGetTableQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, Modal } from "metabase/ui";
import {
  useCheckReplaceSourceQuery,
  useListNodeDependentsQuery,
} from "metabase-enterprise/api";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { ConfirmAndProgressModal } from "./ConfirmAndProgressModal";
import { ModalBody } from "./ModalBody";
import { ModalSidebar } from "./ModalSidebar";
import {
  getCardRequest,
  getCheckReplaceSourceRequest,
  getDependentsRequest,
  getEntityInfo,
  getFailureMessage,
  getSuccessMessage,
  getTableRequest,
} from "./utils";

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
  const [sourceEntry, setSourceEntry] = useState(initialSource);
  const [targetEntry, setTargetEntry] = useState(initialTarget);
  const [isConfirming, { open: openConfirmation, close: closeConfirmation }] =
    useDisclosure();

  const { data: sourceTable } = useGetTableQuery(getTableRequest(sourceEntry));
  const { data: sourceCard } = useGetCardQuery(getCardRequest(sourceEntry));
  const { data: targetTable } = useGetTableQuery(getTableRequest(targetEntry));
  const { data: targetCard } = useGetCardQuery(getCardRequest(targetEntry));
  const { data: dependents = [] } = useListNodeDependentsQuery(
    getDependentsRequest(sourceEntry),
  );
  const { data: checkInfo } = useCheckReplaceSourceQuery(
    getCheckReplaceSourceRequest(sourceEntry, targetEntry),
  );
  const [sendToast] = useToast();

  const sourceInfo = getEntityInfo(sourceEntry, sourceTable, sourceCard);
  const targetInfo = getEntityInfo(targetEntry, targetTable, targetCard);
  const columnMappings = checkInfo?.column_mappings ?? [];

  const handleReplaceSuccess = () => {
    sendToast({ message: getSuccessMessage(dependents.length), icon: "check" });
    closeConfirmation();
    onClose();
  };

  const handleReplaceFailure = () => {
    sendToast({ message: getFailureMessage(), icon: "warning" });
    closeConfirmation();
  };

  return (
    <Flex h="100%">
      <ModalSidebar
        sourceInfo={sourceInfo}
        targetInfo={targetInfo}
        checkInfo={checkInfo}
        dependentsCount={dependents.length}
        onSourceChange={setSourceEntry}
        onTargetChange={setTargetEntry}
        onSubmit={openConfirmation}
        onCancel={onClose}
      />
      <ModalBody
        sourceInfo={sourceInfo}
        targetInfo={targetInfo}
        columnMappings={columnMappings}
      />
      {sourceEntry != null && targetEntry != null && (
        <ConfirmAndProgressModal
          sourceEntry={sourceEntry}
          targetEntry={targetEntry}
          dependentsCount={dependents.length}
          opened={isConfirming}
          onReplaceSuccess={handleReplaceSuccess}
          onReplaceFailure={handleReplaceFailure}
          onClose={closeConfirmation}
        />
      )}
    </Flex>
  );
}

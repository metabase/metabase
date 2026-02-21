import { useDisclosure } from "@mantine/hooks";
import { useLayoutEffect, useState } from "react";

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
import type { TabType } from "./types";
import {
  getCardRequest,
  getCheckReplaceSourceRequest,
  getDependentsRequest,
  getEntityItem,
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
  const [selectedTab, setSelectedTab] = useState<TabType>("column-mappings");
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

  const sourceItem = getEntityItem(sourceEntry, sourceTable, sourceCard);
  const targetItem = getEntityItem(targetEntry, targetTable, targetCard);
  const columnMappings = checkInfo?.column_mappings ?? [];
  const canReplace =
    checkInfo != null && checkInfo.success && dependents.length > 0;

  useLayoutEffect(() => {
    if (!canReplace && selectedTab === "dependents") {
      setSelectedTab("column-mappings");
    }
  }, [selectedTab, canReplace]);

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
        sourceItem={sourceItem}
        targetItem={targetItem}
        checkInfo={checkInfo}
        dependentsCount={dependents.length}
        canReplace={canReplace}
        onSourceChange={setSourceEntry}
        onTargetChange={setTargetEntry}
        onSubmit={openConfirmation}
        onCancel={onClose}
      />
      <ModalBody
        sourceItem={sourceItem}
        targetItem={targetItem}
        selectedTab={selectedTab}
        dependents={dependents}
        canReplace={canReplace}
        columnMappings={columnMappings}
        onTabChange={setSelectedTab}
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

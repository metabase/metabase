import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { useGetCardQuery, useGetTableQuery } from "metabase/api";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import type { SourceReplacementModalProps } from "metabase/plugins";
import { Flex, Modal } from "metabase/ui";
import {
  useCheckReplaceSourceQuery,
  useListNodeDependentsQuery,
} from "metabase-enterprise/api";
import { useReplaceSourceMutation } from "metabase-enterprise/api/replacement";
import type { SourceReplacementEntry } from "metabase-types/api";

import { ModalBody } from "./ModalBody";
import { ModalSidebar } from "./ModalSidebar";
import type { TabType } from "./types";
import {
  canReplaceSource,
  getCardRequest,
  getCheckReplaceSourceRequest,
  getConfirmSubmitLabel,
  getConfirmTitle,
  getDependentsRequest,
  getEntityItem,
  getTableRequest,
} from "./utils";

export function SourceReplacementModal({
  initialSource,
  initialTarget,
  opened,
  onClose,
}: SourceReplacementModalProps) {
  return (
    <Modal.Root opened={opened} fullScreen onClose={onClose}>
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
  initialSource: SourceReplacementEntry | undefined;
  initialTarget: SourceReplacementEntry | undefined;
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
  const [replaceSource] = useReplaceSourceMutation();
  const { show: showConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const { currentData: sourceTable } = useGetTableQuery(
    getTableRequest(sourceEntry),
  );
  const { currentData: sourceCard } = useGetCardQuery(
    getCardRequest(sourceEntry),
  );
  const { currentData: targetTable } = useGetTableQuery(
    getTableRequest(targetEntry),
  );
  const { currentData: targetCard } = useGetCardQuery(
    getCardRequest(targetEntry),
  );
  const { currentData: dependents } = useListNodeDependentsQuery(
    getDependentsRequest(sourceEntry),
  );
  const { currentData: checkInfo } = useCheckReplaceSourceQuery(
    getCheckReplaceSourceRequest(sourceEntry, targetEntry),
  );

  const sourceItem = getEntityItem(sourceEntry, sourceTable, sourceCard);
  const targetItem = getEntityItem(targetEntry, targetTable, targetCard);
  const columnMappings = checkInfo?.column_mappings;
  const canReplace = canReplaceSource(checkInfo, dependents);

  useLayoutEffect(() => {
    if (!canReplace && selectedTab === "dependents") {
      setSelectedTab("column-mappings");
    }
  }, [selectedTab, canReplace]);

  const handleSourceChange = (sourceEntry: SourceReplacementEntry) => {
    setSourceEntry(sourceEntry);
    setTargetEntry(undefined);
  };

  const handleSubmit = () => {
    if (sourceEntry == null || targetEntry == null || dependents == null) {
      return;
    }

    showConfirmation({
      title: getConfirmTitle(dependents.length),
      message: t`This can't be undone.`,
      confirmButtonText: getConfirmSubmitLabel(dependents.length),
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        await replaceSource({
          source_entity_id: sourceEntry.id,
          source_entity_type: sourceEntry.type,
          target_entity_id: targetEntry.id,
          target_entity_type: targetEntry.type,
        }).unwrap();
        onClose();
      },
    });
  };

  return (
    <Flex h="100%">
      <ModalSidebar
        sourceItem={sourceItem}
        targetItem={targetItem}
        checkInfo={checkInfo}
        dependentsCount={dependents?.length}
        canReplace={canReplace}
        onSourceChange={handleSourceChange}
        onTargetChange={setTargetEntry}
        onSubmit={handleSubmit}
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
      {confirmationModal}
    </Flex>
  );
}

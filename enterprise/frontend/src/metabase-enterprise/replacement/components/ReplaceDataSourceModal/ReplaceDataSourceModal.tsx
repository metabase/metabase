import { useState } from "react";

import { useGetCardQuery, useGetTableQuery } from "metabase/api";
import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import {
  useCheckReplaceSourceQuery,
  useListNodeDependentsQuery,
} from "metabase-enterprise/api";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { ModalBody } from "./ModalBody";
import { ModalSidebar } from "./ModalSidebar";
import {
  getCardRequest,
  getCheckReplaceSourceRequest,
  getDependentsRequest,
  getEntityInfo,
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
  const [sourceEntry, setSourceEntry] = useState(initialSource);
  const [targetEntry, setTargetEntry] = useState(initialTarget);

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

  const sourceInfo = getEntityInfo(sourceEntry, sourceTable, sourceCard);
  const targetInfo = getEntityInfo(targetEntry, targetTable, targetCard);

  const handleSubmit = () => {};

  return (
    <Flex>
      <ModalSidebar
        sourceInfo={sourceInfo}
        targetInfo={targetInfo}
        dependentsCount={dependents.length}
        onSourceChange={setSourceEntry}
        onTargetChange={setTargetEntry}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
      <ModalBody
        sourceInfo={sourceInfo}
        targetInfo={targetInfo}
        columnMappings={checkInfo?.column_mappings ?? []}
      />
    </Flex>
  );
}

import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import {
  useCheckReplaceSourceQuery,
  useListNodeDependentsQuery,
  useReplaceSourceMutation,
} from "metabase-enterprise/api";

import { ModalBody } from "./ModalBody";
import { ModalFooter } from "./ModalFooter";
import { ModalHeader } from "./ModalHeader";
import type { TabType } from "./types";
import {
  getCheckReplaceSourceRequest,
  getDescendantsRequest,
  getReplaceSourceRequest,
  getSubmitLabel,
  getSuccessToastMessage,
  getTabs,
  getValidationInfo,
  shouldResetTab,
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
  initialSource: ReplaceDataSourceModalProps["initialSource"];
  initialTarget: ReplaceDataSourceModalProps["initialTarget"];
  onClose: () => void;
};

function ModalContent({
  initialSource,
  initialTarget,
  onClose,
}: ModalContentProps) {
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(initialTarget);
  const [selectedTabType, setSelectedTabType] = useState<TabType>();

  const { data: nodes } = useListNodeDependentsQuery(
    getDescendantsRequest(source, target),
  );
  const { data: checkInfo } = useCheckReplaceSourceQuery(
    getCheckReplaceSourceRequest(source, target),
  );
  const [replaceSource, { isLoading: isReplacing }] =
    useReplaceSourceMutation();
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();
  const [sendToast] = useToast();

  const tabs = useMemo(() => {
    return getTabs(nodes, checkInfo);
  }, [nodes, checkInfo]);

  const selectedTab = useMemo(() => {
    return tabs.find((tab) => tab.type === selectedTabType);
  }, [tabs, selectedTabType]);

  const validationInfo = useMemo(() => {
    return getValidationInfo(source, target, nodes, checkInfo);
  }, [source, target, nodes, checkInfo]);

  const submitLabel = useMemo(() => {
    return getSubmitLabel(nodes, validationInfo);
  }, [nodes, validationInfo]);

  useLayoutEffect(() => {
    if (shouldResetTab(tabs, selectedTabType)) {
      setSelectedTabType(tabs[0]?.type);
    }
  }, [tabs, selectedTabType]);

  const handleReplace = () => {
    if (source == null || target == null) {
      return;
    }

    showConfirmation({
      title: t`Replace data source?`,
      message: t`This action cannot be undone.`,
      confirmButtonText: submitLabel,
      onConfirm: async () => {
        await replaceSource(getReplaceSourceRequest(source, target)).unwrap();
        sendToast({ icon: "check", message: getSuccessToastMessage(nodes) });
        onClose();
      },
    });
  };

  return (
    <>
      <Flex h="100%" direction="column">
        <ModalHeader
          source={source}
          target={target}
          tabs={tabs}
          selectedTabType={selectedTabType}
          onSourceChange={setSource}
          onTargetChange={setTarget}
          onTabChange={setSelectedTabType}
        />
        <ModalBody selectedTab={selectedTab} />
        <ModalFooter
          submitLabel={submitLabel}
          validationInfo={validationInfo}
          isReplacing={isReplacing}
          onReplace={handleReplace}
          onClose={onClose}
        />
      </Flex>
      {confirmationModal}
    </>
  );
}

import { useDisclosure } from "@mantine/hooks";
import { useLayoutEffect, useMemo, useState } from "react";

import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import {
  useCheckReplaceSourceQuery,
  useListNodeDependentsQuery,
} from "metabase-enterprise/api";

import { ConfirmAndProgressModal } from "./ConfirmAndProgressModal";
import { ModalBody } from "./ModalBody";
import { ModalFooter } from "./ModalFooter";
import { ModalHeader } from "./ModalSidebar";
import type { TabType } from "./types";
import {
  getCheckReplaceSourceRequest,
  getDescendantsRequest,
  getEmptyStateType,
  getSubmitLabel,
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
    getDescendantsRequest(source),
  );
  const { data: checkInfo } = useCheckReplaceSourceQuery(
    getCheckReplaceSourceRequest(source, target),
  );
  const [isConfirming, { open: openConfirmation, close: closeConfirmation }] =
    useDisclosure();

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
        <ModalBody
          selectedTab={selectedTab}
          emptyStateType={getEmptyStateType(nodes)}
        />
        <ModalFooter
          submitLabel={submitLabel}
          validationInfo={validationInfo}
          onReplace={openConfirmation}
          onClose={onClose}
        />
      </Flex>
      {source != null && target != null && (
        <ConfirmAndProgressModal
          source={source}
          target={target}
          isOpened={isConfirming}
          onDone={onClose}
          onClose={closeConfirmation}
        />
      )}
    </>
  );
}

import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import {
  useCheckReplaceSourceQuery,
  useListNodeDependentsQuery,
  useReplaceSourceMutation,
} from "metabase-enterprise/api";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { ModalBody } from "./ModalBody";
import { ModalFooter } from "./ModalFooter";
import { ModalHeader } from "./ModalHeader";
import { DEPENDENT_TYPES } from "./constants";
import type { TabType } from "./types";
import { getTabs } from "./utils";

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
  const [selectedTabType, setSelectedTabType] = useState<TabType>();

  const { data: nodes } = useListNodeDependentsQuery(
    getDescendantRequest(source),
  );
  const { data: checkInfo } = useCheckReplaceSourceQuery(
    getCheckReplaceSourceRequest(source, target),
  );
  const [replaceSource, { isLoading: isReplacing }] =
    useReplaceSourceMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const tabs = useMemo(() => {
    return getTabs(nodes, checkInfo);
  }, [nodes, checkInfo]);

  const selectedTab = useMemo(() => {
    return tabs.find((tab) => tab.type === selectedTabType);
  }, [tabs, selectedTabType]);

  useLayoutEffect(() => {
    if (tabs.length > 0 && selectedTabType == null) {
      setSelectedTabType(tabs[0].type);
    }
  }, [tabs, selectedTabType]);

  const handleReplace = async () => {
    if (source == null || target == null) {
      return;
    }
    const { error } = await replaceSource(
      getReplaceSourceRequest(source, target),
    );
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
        tabs={tabs}
        selectedTabType={selectedTabType}
        onSourceChange={setSource}
        onTargetChange={setTarget}
        onTabChange={setSelectedTabType}
      />
      <ModalBody selectedTab={selectedTab} />
      <ModalFooter
        canReplace
        isReplacing={isReplacing}
        onReplace={handleReplace}
        onClose={onClose}
      />
    </Flex>
  );
}

function getDescendantRequest(source: ReplaceSourceEntry | undefined) {
  if (source == null) {
    return skipToken;
  }
  return {
    id: source.id,
    type: source.type,
    dependent_types: DEPENDENT_TYPES,
  };
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

function getReplaceSourceRequest(
  source: ReplaceSourceEntry,
  target: ReplaceSourceEntry,
) {
  return {
    source_entity_id: source.id,
    source_entity_type: source.type,
    target_entity_id: target.id,
    target_entity_type: target.type,
  };
}

import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { Modal } from "metabase/ui";
import type {
  ReplaceSourceEntry,
  ReplaceSourceRunId,
} from "metabase-types/api";

import { ConfirmModalContent } from "./ConfirmModalContent";
import { ProgressModalContent } from "./ProgressModalContent";

type ConfirmAndProgressModalProps = {
  sourceEntry: ReplaceSourceEntry;
  targetEntry: ReplaceSourceEntry;
  dependentsCount: number;
  opened: boolean;
  onReplaceSuccess: () => void;
  onReplaceFailure: () => void;
  onClose: () => void;
};

export function ConfirmAndProgressModal({
  sourceEntry,
  targetEntry,
  dependentsCount,
  opened,
  onReplaceSuccess,
  onReplaceFailure,
  onClose,
}: ConfirmAndProgressModalProps) {
  const [runId, setRunId] = useState<ReplaceSourceRunId>();
  const isStarted = runId != null;

  const handleReplaceSuccess = () => {
    setRunId(undefined);
    onReplaceSuccess();
  };

  const handleReplaceFailure = () => {
    setRunId(undefined);
    onReplaceFailure();
  };

  return (
    <Modal
      title={getTitle(dependentsCount, isStarted)}
      opened={opened}
      onClose={onClose}
    >
      {runId == null ? (
        <ConfirmModalContent
          sourceEntry={sourceEntry}
          targetEntry={targetEntry}
          dependentsCount={dependentsCount}
          onSubmit={setRunId}
          onCancel={onClose}
        />
      ) : (
        <ProgressModalContent
          runId={runId}
          onReplaceSuccess={handleReplaceSuccess}
          onReplaceFailure={handleReplaceFailure}
        />
      )}
    </Modal>
  );
}

function getTitle(dependentsCount: number, isStarted: boolean) {
  if (isStarted) {
    return t`Replacing data sources…`;
  }
  return ngettext(
    msgid`Really replace the data source in this ${dependentsCount} item?`,
    `Really replace the data sources in these ${dependentsCount} items?`,
    dependentsCount,
  );
}

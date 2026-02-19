import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { Modal } from "metabase/ui";
import type {
  ReplaceSourceEntry,
  ReplaceSourceRun,
  ReplaceSourceRunId,
} from "metabase-types/api";

import { ConfirmModalContent } from "./ConfirmModalContent";
import { ProgressModalContent } from "./ProgressModalContent";

type ConfirmAndProgressModalProps = {
  source: ReplaceSourceEntry;
  target: ReplaceSourceEntry;
  itemsCount: number;
  opened: boolean;
  onDone: () => void;
  onClose: () => void;
};

export function ConfirmAndProgressModal({
  source,
  target,
  itemsCount,
  opened,
  onDone,
  onClose,
}: ConfirmAndProgressModalProps) {
  const [runId, setRunId] = useState<ReplaceSourceRunId>();
  const [sendToast] = useToast();

  const isStarted = runId != null;

  const handleDone = (run: ReplaceSourceRun) => {
    if (run.status === "succeeded") {
      sendToast({
        message: getSuccessMessage(itemsCount),
        icon: "check",
      });
    } else {
      sendToast({
        message: getErrorMessage(),
        icon: "warning",
      });
    }
    onDone();
  };

  return (
    <Modal
      title={getTitle(itemsCount, isStarted)}
      opened={opened}
      onClose={onClose}
    >
      {runId == null ? (
        <ConfirmModalContent
          source={source}
          target={target}
          itemsCount={itemsCount}
          disabled={runId != null}
          onSubmit={setRunId}
          onCancel={onClose}
        />
      ) : (
        <ProgressModalContent runId={runId} onDone={handleDone} />
      )}
    </Modal>
  );
}

function getTitle(itemsCount: number, isStarted: boolean) {
  if (isStarted) {
    return t`Replacing data sources…`;
  }
  return ngettext(
    msgid`Really replace the data source in this ${itemsCount} item?`,
    `Really replace the data sources in these ${itemsCount} items?`,
    itemsCount,
  );
}

function getSuccessMessage(itemsCount: number): string {
  return ngettext(
    msgid`Updated ${itemsCount} item`,
    `Updated ${itemsCount} items`,
    itemsCount,
  );
}

function getErrorMessage(): string {
  return t`Failed to replace a data source`;
}

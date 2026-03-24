import { t } from "ttag";

import { isSyncAborted, isSyncInProgress } from "metabase/lib/syncing";
import type { Database, InitialSyncStatus } from "metabase-types/api";

import StatusSmall from "../StatusSmall";
import { getIconName, isSpinnerVisible } from "../utils/status";

export type DatabaseStatusSmallProps = {
  databases: Database[];
  onExpand?: () => void;
};

export const DatabaseStatusSmall = ({
  databases,
  onExpand,
}: DatabaseStatusSmallProps) => {
  const status = getStatus(databases);
  const statusLabel = getStatusLabel(status);
  const hasSpinner = isSpinnerVisible(status);
  const icon = getIconName(status);

  return (
    <StatusSmall
      status={status}
      statusLabel={statusLabel}
      hasSpinner={hasSpinner}
      icon={icon}
      onExpand={onExpand}
    />
  );
};

const getStatus = (databases: Database[]): InitialSyncStatus => {
  if (databases.some(isSyncInProgress)) {
    return "incomplete";
  } else if (databases.some(isSyncAborted)) {
    return "aborted";
  } else {
    return "complete";
  }
};

const getStatusLabel = (status: InitialSyncStatus): string => {
  switch (status) {
    case "incomplete":
      return t`Syncing database…`;
    case "complete":
      return t`Done!`;
    case "aborted":
      return t`Error syncing`;
  }
};

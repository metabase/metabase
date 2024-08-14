import { t } from "ttag";

import { isSyncAborted, isSyncInProgress } from "metabase/lib/syncing";
import type Database from "metabase-lib/v1/metadata/Database";
import type { InitialSyncStatus } from "metabase-types/api";

import StatusSmall from "../StatusSmall";
import { getIconName, isSpinnerVisible } from "../utils/status";

export interface DatabaseStatusSmallProps {
  databases: Database[];
  onExpand?: () => void;
}

const DatabaseStatusSmall = ({
  databases,
  onExpand,
}: DatabaseStatusSmallProps): JSX.Element => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseStatusSmall;

import { t } from "ttag";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { isSyncAborted, isSyncInProgress } from "metabase/lib/syncing";
import { InitialSyncStatus } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";
import StatusSmall from "../StatusSmall";

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

const getIconName = (status: InitialSyncStatus): string => {
  switch (status) {
    case "incomplete":
      return "database";
    case "complete":
      return "check";
    case "aborted":
      return "warning";
  }
};

const isSpinnerVisible = (status: InitialSyncStatus): boolean => {
  switch (status) {
    case "incomplete":
      return !isReducedMotionPreferred();
    default:
      return false;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseStatusSmall;

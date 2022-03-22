import React from "react";
import { t } from "ttag";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { isSyncAborted, isSyncInProgress } from "metabase/lib/syncing";
import Tooltip from "metabase/components/Tooltip";
import { Database, InitialSyncStatus } from "metabase-types/api";
import {
  StatusRoot,
  StatusIconContainer,
  StatusIcon,
  StatusContainer,
  StatusSpinner,
} from "./DatabaseStatusSmall.styled";

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

  return (
    <Tooltip tooltip={statusLabel}>
      <StatusRoot role="status" aria-label={statusLabel} onClick={onExpand}>
        <StatusContainer status={status}>
          <StatusIconContainer status={status}>
            <StatusIcon status={status} name={getIconName(status)} />
          </StatusIconContainer>
        </StatusContainer>
        {hasSpinner && <StatusSpinner size={48} />}
      </StatusRoot>
    </Tooltip>
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

export default DatabaseStatusSmall;

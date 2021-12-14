import React from "react";
import { t } from "ttag";
import {
  isSyncAborted,
  isSyncCompleted,
  isSyncInProgress,
} from "metabase/lib/syncing";
import Tooltip from "metabase/components/Tooltip";
import { Database, InitialSyncStatus } from "../../types";
import {
  StatusRoot,
  StatusIconContainer,
  StatusIcon,
  StatusContainer,
  StatusImage,
  StatusCircle,
} from "./DatabaseStatusSmall.styled";

const CIRCLE_WIDTH = 48;
const STROKE_WIDTH = 4;
const CIRCLE_CENTER = CIRCLE_WIDTH / 2;
const CIRCLE_RADIUS = (CIRCLE_WIDTH - STROKE_WIDTH) / 2;
const CIRCLE_PERIMETER = 2 * Math.PI * CIRCLE_RADIUS;

interface Props {
  databases: Database[];
  onExpand: () => void;
}

const DatabaseStatusSmall = ({ databases, onExpand }: Props): JSX.Element => {
  const status = getStatus(databases);
  const progress = getProgress(databases);
  const statusLabel = getStatusLabel(status);

  return (
    <Tooltip tooltip={statusLabel}>
      <StatusRoot role="status" aria-label={statusLabel} onClick={onExpand}>
        <StatusContainer status={status}>
          <StatusIconContainer status={status}>
            <StatusIcon status={status} name={getIconName(status)} />
          </StatusIconContainer>
        </StatusContainer>
        <StatusImage viewBox={`0 0 ${CIRCLE_WIDTH} ${CIRCLE_WIDTH}`}>
          <StatusCircle
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={CIRCLE_RADIUS}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={getCircleDasharray(progress)}
          />
        </StatusImage>
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

const getProgress = (databases: Database[]): number => {
  if (databases.every(isSyncCompleted)) {
    return 1;
  }

  const syncingDatabases = databases.filter(isSyncInProgress);
  const syncingTables = syncingDatabases.flatMap(d => d.tables ?? []);
  const doneCount = syncingTables.filter(isSyncCompleted).length;
  const totalCount = syncingTables.length;
  return totalCount > 0 ? doneCount / totalCount : 0;
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

const getCircleDasharray = (progress: number): string | undefined => {
  return progress < 1
    ? `${progress * CIRCLE_PERIMETER} ${CIRCLE_PERIMETER}`
    : undefined;
};

export default DatabaseStatusSmall;

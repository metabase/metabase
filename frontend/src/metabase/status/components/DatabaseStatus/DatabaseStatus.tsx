import React from "react";
import { t } from "ttag";
import { isSyncCompleted, isSyncInProgress } from "metabase/lib/syncing";
import Tooltip from "metabase/components/Tooltip";
import useStatusVisibility from "../../hooks/use-status-visibility";
import { Database } from "../../types";
import {
  StatusRoot,
  StatusIconContainer,
  StatusIcon,
  StatusContainer,
  StatusImage,
  StatusCircle,
} from "./DatabaseStatus.styled";

const CIRCLE_WIDTH = 48;
const STROKE_WIDTH = 4;
const CIRCLE_CENTER = CIRCLE_WIDTH / 2;
const CIRCLE_RADIUS = (CIRCLE_WIDTH - STROKE_WIDTH) / 2;
const CIRCLE_PERIMETER = 2 * Math.PI * CIRCLE_RADIUS;

interface Props {
  database: Database;
}

const DatabaseStatus = ({ database }: Props) => {
  const status = database.initial_sync_status;
  const progress = getProgress(database);
  const progressLabel = getProgressLabel(database, progress);
  const isVisible = useStatusVisibility(isSyncInProgress(database));

  if (!isVisible) {
    return null;
  }

  return (
    <Tooltip tooltip={progressLabel}>
      <StatusRoot role="status" aria-label={progressLabel}>
        <StatusContainer status={status}>
          <StatusIconContainer status={status}>
            <StatusIcon status={status} name={getIconName(database)} />
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

const getProgress = (database: Database) => {
  if (isSyncCompleted(database)) {
    return 1;
  } else if (database.tables) {
    const done = database.tables.filter(isSyncCompleted).length;
    const total = database.tables.length;
    return total > 0 ? done / total : 0;
  } else {
    return 0;
  }
};

const getProgressLabel = (database: Database, progress: number) => {
  const percent = Math.floor(progress * 100);

  switch (database.initial_sync_status) {
    case "incomplete":
      return t`Syncing ${database.name} (${percent}%)`;
    case "complete":
      return t`${database.name} is ready!`;
    case "aborted":
      return t`Error syncing ${database.name}`;
  }
};

const getIconName = (database: Database) => {
  switch (database.initial_sync_status) {
    case "incomplete":
      return "database";
    case "complete":
      return "check";
    case "aborted":
      return "warning";
  }
};

const getCircleDasharray = (progress: number) => {
  return progress < 1
    ? `${progress * CIRCLE_PERIMETER} ${CIRCLE_PERIMETER}`
    : undefined;
};

export default DatabaseStatus;

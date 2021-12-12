import React from "react";
import { t } from "ttag";
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

const STROKE_WIDTH = 4;
const CIRCLE_WIDTH = 48;
const CIRCLE_CENTER = CIRCLE_WIDTH / 2;
const CIRCLE_RADIUS = (CIRCLE_WIDTH - STROKE_WIDTH) / 2;
const CIRCLE_PERIMETER = 2 * Math.PI * CIRCLE_RADIUS;

interface Props {
  database: Database;
}

const DatabaseStatus = ({ database }: Props) => {
  const status = database.initial_sync_status;
  const isActive = status === "incomplete";
  const isVisible = useStatusVisibility(isActive);
  const progress = getProgress(database);
  const progressLabel = getProgressLabel(database, progress);

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

const getProgress = ({ tables = [] }: Database) => {
  const done = tables.filter(t => t.initial_sync_status === "complete").length;
  const total = tables.length;
  return total != 0 ? done / total : 0;
};

const getProgressLabel = (database: Database, progress: number) => {
  const percent = Math.floor(progress * 100);

  switch (database.initial_sync_status) {
    case "incomplete":
      return t`Syncing ${database.name} (${percent}%)`;
    case "complete":
      return t`Done!`;
    case "aborted":
      return t`Error syncing`;
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
    : "";
};

export default DatabaseStatus;

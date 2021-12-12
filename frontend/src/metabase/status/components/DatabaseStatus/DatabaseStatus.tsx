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
} from "./DatabaseStatus.styled";

interface Props {
  database: Database;
}

const DatabaseStatus = ({ database }: Props) => {
  const status = database.initial_sync_status;
  const isActive = status === "incomplete";
  const isVisible = useStatusVisibility(isActive);

  if (!isVisible) {
    return null;
  }

  return (
    <Tooltip tooltip={getLabel(database)}>
      <StatusRoot role="status" aria-label={getLabel(database)}>
        <StatusContainer status={status}>
          <StatusIconContainer status={status}>
            <StatusIcon status={status} name={getIconName(database)} />
          </StatusIconContainer>
        </StatusContainer>
      </StatusRoot>
    </Tooltip>
  );
};

const getLabel = (database: Database) => {
  switch (database.initial_sync_status) {
    case "incomplete":
      return t`Syncing ${database.name}…`;
    case "complete":
      return t`Done!`;
    case "aborted":
      return t`Error syncing`;
  }
};

export const getIconName = (database: Database) => {
  switch (database.initial_sync_status) {
    case "incomplete":
      return "database";
    case "complete":
      return "check";
    case "aborted":
      return "warning";
  }
};

export default DatabaseStatus;

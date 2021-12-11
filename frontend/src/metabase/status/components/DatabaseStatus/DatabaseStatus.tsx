import React from "react";
import useStatusVisibility from "../../hooks/use-status-visibility";
import { Database } from "../../types";
import {
  StatusRoot,
  StatusIconContainer,
  StatusIcon,
  getIconName,
} from "./DatabaseStatus.styled";

interface Props {
  database: Database;
}

const DatabaseStatus = ({ database }: Props) => {
  const isActive = database.initial_sync_status === "incomplete";
  const isVisible = useStatusVisibility(isActive);

  if (!isVisible) {
    return null;
  }

  return (
    <StatusRoot status={database.initial_sync_status}>
      <StatusIconContainer status={database.initial_sync_status}>
        <StatusIcon
          status={database.initial_sync_status}
          name={getIconName(database)}
        />
      </StatusIconContainer>
    </StatusRoot>
  );
};

export default DatabaseStatus;

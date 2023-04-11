import React from "react";
import Tooltip from "metabase/core/components/Tooltip";
import { InitialSyncStatus } from "metabase-types/api";
import {
  StatusRoot,
  StatusIconContainer,
  StatusIcon,
  StatusContainer,
  StatusSpinner,
} from "./StatusSmall.styled";

export interface StatusSmallProps {
  status: InitialSyncStatus;
  statusLabel: string;
  hasSpinner: boolean;
  icon: string;
  onExpand?: () => void;
}

const StatusSmall = ({
  status,
  statusLabel,
  hasSpinner,
  icon,
  onExpand,
}: StatusSmallProps): JSX.Element => {
  return (
    <Tooltip tooltip={statusLabel}>
      <StatusRoot role="status" aria-label={statusLabel} onClick={onExpand}>
        <StatusContainer status={status}>
          <StatusIconContainer status={status}>
            <StatusIcon status={status} name={icon} />
          </StatusIconContainer>
        </StatusContainer>
        {hasSpinner && <StatusSpinner size={48} />}
      </StatusRoot>
    </Tooltip>
  );
};

export default StatusSmall;

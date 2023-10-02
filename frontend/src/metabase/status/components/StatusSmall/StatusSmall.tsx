import Tooltip from "metabase/core/components/Tooltip";
import type { InitialSyncStatus } from "metabase-types/api";
import type { IconName } from "metabase/core/components/Icon";
import {
  StatusRoot,
  StatusIconContainer,
  StatusIcon,
  StatusContainer,
} from "./StatusSmall.styled";
import LoadingSpinner from "metabase/components/LoadingSpinner";

export interface StatusSmallProps {
  status: InitialSyncStatus;
  statusLabel: string;
  hasSpinner: boolean;
  icon: IconName;
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
        {hasSpinner && (
          <LoadingSpinner top={0} left={0} pos="absolute" size={48} />
        )}
      </StatusRoot>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StatusSmall;

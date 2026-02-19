import type { IconName } from "metabase/ui";
import { Flex, Icon, Loader, Tooltip, UnstyledButton } from "metabase/ui";
import type { InitialSyncStatus } from "metabase-types/api";

import Styles from "./StatusSmall.module.css";

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
    <Tooltip label={statusLabel}>
      <UnstyledButton
        className={Styles.Root}
        role="status"
        aria-label={statusLabel}
        data-status={status}
        onClick={onExpand}
      >
        <Flex
          align="center"
          justify="center"
          className={Styles.StatusContainer}
        >
          <Flex
            align="center"
            justify="center"
            className={Styles.StatusIconContainer}
          >
            <Icon width={"sm"} name={icon} />
          </Flex>
        </Flex>
        {hasSpinner && <Loader pos="absolute" inset={0} size={48} />}
      </UnstyledButton>
    </Tooltip>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StatusSmall;

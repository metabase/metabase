import { t } from "ttag";

import { Group, Radio } from "metabase/ui";

import { ACTIVE_STATUS, type ActiveStatus } from "../constants";

interface ActiveStatusFilterProps {
  status: ActiveStatus;
  onStatusChange: (status: ActiveStatus) => void;
}
export const ActiveStatusFilter = ({
  status,
  onStatusChange,
}: ActiveStatusFilterProps) => {
  return (
    <Radio.Group
      value={status}
      onChange={(val) => onStatusChange(ACTIVE_STATUS[val])}
    >
      <Group>
        <Radio label={t`Active`} value={ACTIVE_STATUS.active} />
        <Radio label={t`Deactivated`} value={ACTIVE_STATUS.deactivated} />
      </Group>
    </Radio.Group>
  );
};

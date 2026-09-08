import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Tooltip } from "metabase/ui";

type CheckpointValueProps = {
  value: string;
  checkpointField?: Field;
};

export function CheckpointValue({
  value,
  checkpointField,
}: CheckpointValueProps) {
  if (isDate(checkpointField)) {
    return (
      <Tooltip label={value}>
        <DateTime value={value} unit="minute" />
      </Tooltip>
    );
  }

  return <>{value}</>;
}

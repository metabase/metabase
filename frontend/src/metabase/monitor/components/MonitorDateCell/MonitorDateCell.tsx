import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/ui";

type MonitorDateCellProps = {
  value: string;
};

export const MonitorDateCell = ({ value }: MonitorDateCellProps) => (
  <Ellipsified>
    <DateTime value={value} unit="minute" />
  </Ellipsified>
);

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/ui";

type MonitorDateCellProps = {
  value: string;
};

/** A timestamp in a Monitor table cell, truncated rather than wrapped when the column is narrow. */
export const MonitorDateCell = ({ value }: MonitorDateCellProps) => (
  <Ellipsified>
    <DateTime value={value} unit="minute" />
  </Ellipsified>
);

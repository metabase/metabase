import { DateTime } from "metabase/common/components/DateTime";
import { Text } from "metabase/ui";

type MonitorDateValueProps = {
  value: string;
};

/** A timestamp in a Monitor detail sidebar's details table, styled as the row's other values are. */
export const MonitorDateValue = ({ value }: MonitorDateValueProps) => (
  <Text size="md" c="text-primary">
    <DateTime value={value} unit="minute" />
  </Text>
);

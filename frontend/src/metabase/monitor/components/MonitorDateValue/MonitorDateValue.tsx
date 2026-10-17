import { DateTime } from "metabase/common/components/DateTime";
import { Text } from "metabase/ui";

type MonitorDateValueProps = {
  value: string;
};

export const MonitorDateValue = ({ value }: MonitorDateValueProps) => (
  <Text size="md" c="text-primary">
    <DateTime value={value} unit="minute" />
  </Text>
);

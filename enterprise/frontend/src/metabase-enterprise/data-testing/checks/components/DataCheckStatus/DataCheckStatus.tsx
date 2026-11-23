import { Group, Icon, Text } from "metabase/ui";

import {
  type DataCheckDisplayStatus,
  getDataCheckStatusPresentation,
} from "../../utils";

type DataCheckStatusProps = {
  status: DataCheckDisplayStatus;
  withLabel?: boolean;
};

export function DataCheckStatus({
  status,
  withLabel = true,
}: DataCheckStatusProps) {
  const { label, icon, color } = getDataCheckStatusPresentation(status);

  return (
    <Group gap="xs" wrap="nowrap" flex="none">
      <Icon name={icon} c={color} aria-label={withLabel ? undefined : label} />
      {withLabel && (
        <Text c={color} fw="bold">
          {label}
        </Text>
      )}
    </Group>
  );
}

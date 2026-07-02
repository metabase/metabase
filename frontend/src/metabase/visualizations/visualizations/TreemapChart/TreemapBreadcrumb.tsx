import { t } from "ttag";

import { Group, Icon, Text, UnstyledButton } from "metabase/ui";

interface TreemapBreadcrumbProps {
  groupLabel: string | null;
  value: string;
  onBackClick: () => void;
}

export function TreemapBreadcrumb({
  groupLabel,
  value,
  onBackClick,
}: TreemapBreadcrumbProps) {
  return (
    <Group data-testid="treemap-breadcrumb" gap="sm">
      <Label groupLabel={groupLabel} onBackClick={onBackClick} />
      <Text fw={400} lh="md">
        {value}
      </Text>
    </Group>
  );
}

function Label({
  groupLabel,
  onBackClick,
}: {
  groupLabel: string | null;
  onBackClick: () => void;
}) {
  if (groupLabel == null) {
    return <Text fw={700} lh="md">{t`Total`}</Text>;
  }

  return (
    <UnstyledButton type="button" onClick={onBackClick}>
      <Group>
        <Icon name="arrow_left" aria-hidden />
        <Text fw={700}>{groupLabel}</Text>
      </Group>
    </UnstyledButton>
  );
}

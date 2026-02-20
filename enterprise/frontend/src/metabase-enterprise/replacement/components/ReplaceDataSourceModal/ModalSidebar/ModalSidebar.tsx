import { msgid, ngettext, t } from "ttag";

import { Button, Group, Stack, Text, Title } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { EntitySection } from "./EntitySection";
import { EntitySelect } from "./EntitySelect";

type ModalSidebarProps = {
  source: ReplaceSourceEntry | undefined;
  target: ReplaceSourceEntry | undefined;
  dependentsCount: number;
  canReplace: boolean;
  onSourceChange: (source: ReplaceSourceEntry) => void;
  onTargetChange: (target: ReplaceSourceEntry) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ModalSidebar({
  source,
  target,
  dependentsCount,
  canReplace,
  onSourceChange,
  onTargetChange,
  onSubmit,
  onCancel,
}: ModalSidebarProps) {
  return (
    <Stack px="xl" pt="xl" pb="lg" gap="lg">
      <Stack gap="sm">
        <Title order={2}>{t`Find and replace a data source`}</Title>
        <Text>{t`This lets you change the data source used in queries in bulk. `}</Text>
      </Stack>
      <Stack gap="lg">
        <EntitySection icon="search">
          <EntitySelect
            value={source}
            label={t`Find all occurrences of this data source`}
            description={t`We'll look for every query in your instance that uses this data source.`}
            onChange={onSourceChange}
          />
        </EntitySection>
        <EntitySection icon="find_replace">
          <EntitySelect
            value={target}
            label={t`Replace it with this data source`}
            description={t`It must be based on the same database and include all columns from the original data source.`}
            onChange={onTargetChange}
          />
        </EntitySection>
      </Stack>
      <Group mt="auto" justify="flex-end" wrap="nowrap">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button variant="filled" onClick={onSubmit}>
          {getSubmitLabel(dependentsCount, canReplace)}
        </Button>
      </Group>
    </Stack>
  );
}

function getSubmitLabel(dependentsCount: number, canReplace: boolean): string {
  if (!canReplace) {
    return t`Replace data source`;
  }

  return ngettext(
    msgid`Replace data source in ${dependentsCount} item`,
    `Replace data source in ${dependentsCount} items`,
    dependentsCount,
  );
}

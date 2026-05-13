import { t } from "ttag";

import { Badge, Group } from "metabase/ui";

import type { IntrospectorRow } from "../types";

interface Props {
  row: IntrospectorRow;
}

export function ConditionBadges({ row }: Props) {
  return (
    <Group gap="xs">
      {row.is_broken ? (
        <Badge color="error" variant="light">{t`Broken`}</Badge>
      ) : null}
      {row.is_stale ? (
        <Badge color="warning" variant="light">{t`Stale`}</Badge>
      ) : null}
      {row.is_unreferenced ? (
        <Badge color="brand" variant="light">{t`Unreferenced`}</Badge>
      ) : null}
    </Group>
  );
}

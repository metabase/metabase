import { t } from "ttag";

import { Group, Pill } from "metabase/ui";

/** A group's members on its card, in order, with Other last and muted */
export function GroupMemberPills({
  labels,
  hasOther = false,
}: {
  labels: string[];
  hasOther?: boolean;
}) {
  return (
    <Group gap="xs" wrap="wrap">
      {labels.map((label, index) => (
        <Pill key={`${label}-${index}`} bdrs="xl">
          {label}
        </Pill>
      ))}
      {hasOther && (
        <Pill bdrs="xl" c="text-secondary">
          {t`Other`}
        </Pill>
      )}
    </Group>
  );
}

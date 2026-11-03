import { msgid, ngettext, t } from "ttag";

import { Badge, Group } from "metabase/ui";

export function CheckCountBadges({
  failedCount,
  warningCount,
  isConfirmed = false,
}: {
  failedCount: number;
  warningCount: number;
  isConfirmed?: boolean;
}) {
  const hasIssues = failedCount > 0 || warningCount > 0;
  return (
    <Group gap="xs">
      {isConfirmed && (
        <Badge color="positive" variant="light">{t`Reviewed`}</Badge>
      )}
      {failedCount > 0 && (
        <Badge color="negative" variant="light">
          {ngettext(
            msgid`${failedCount} failing`,
            `${failedCount} failing`,
            failedCount,
          )}
        </Badge>
      )}
      {warningCount > 0 && (
        <Badge color="warning" variant="light">
          {ngettext(
            msgid`${warningCount} warning`,
            `${warningCount} warnings`,
            warningCount,
          )}
        </Badge>
      )}
      {!hasIssues && !isConfirmed && (
        <Badge color="positive" variant="light">{t`All pass`}</Badge>
      )}
    </Group>
  );
}

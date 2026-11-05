import { t } from "ttag";

import { Anchor, Group, Loader, Text } from "metabase/ui";

const DATA_QUALITY_URL = "https://github.com/metabase/data-quality";

export function DataQualityChecks({
  failingCount,
}: {
  failingCount: number | null;
}) {
  return (
    <Group gap="sm" justify="space-between" wrap="nowrap">
      <Text>{t`In data quality`}</Text>
      {failingCount == null ? (
        <Loader size="xs" />
      ) : (
        <Anchor
          href={DATA_QUALITY_URL}
          target="_blank"
          rel="noreferrer"
          flex="0 0 auto"
        >
          {failingCount > 0 ? t`${failingCount} failing` : t`All passing`}
        </Anchor>
      )}
    </Group>
  );
}

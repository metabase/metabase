import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Group, Stack, Text } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

import { DataAppIcon } from "./DataAppIcon";

type Props = {
  app: DataApp;
};

export function DataAppSummary({ app }: Props) {
  return (
    <Group align="flex-start" flex="1" wrap="nowrap">
      <DataAppIcon app={app} />
      <Stack flex="1" gap="xs" py="xs">
        <Link to={`/data-app/${encodeURIComponent(app.name)}`}>
          <Text fw={700} c="brand">
            {app.display_name}
          </Text>
        </Link>
        <Group gap="xs">
          <Text size="sm" c="text-tertiary" ff="monospace">
            {`/data-app/${app.name}`}
          </Text>
          <Text size="sm" c="text-tertiary">
            &bull;
          </Text>
          <Text size="sm" c="text-tertiary">
            {t`Bundle: ${app.bundle_hash.slice(0, 8)}`}
          </Text>
        </Group>
      </Stack>
    </Group>
  );
}

import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Group, Stack, Text } from "metabase/ui";
import type { DataApp } from "metabase-types/api";

import { DataAppIcon } from "./DataAppIcon";

type Props = {
  app: DataApp;
};

function SyncStatus({ app }: Props) {
  if (app.sync_error) {
    return (
      <Text size="sm" c="error" title={app.sync_error}>
        {t`Sync failed`}
      </Text>
    );
  }
  if (app.last_synced_sha) {
    return (
      <Text size="sm" c="text-tertiary">
        {t`Synced ${app.last_synced_sha.slice(0, 7)}`}
      </Text>
    );
  }
  return (
    <Text size="sm" c="text-tertiary">
      {t`Not synced yet`}
    </Text>
  );
}

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
        <Group gap="xs" align="center">
          <Text size="sm" c="text-tertiary" ff="monospace">
            {`/data-app/${app.name}`}
          </Text>
          <Text size="sm" c="text-tertiary">
            &bull;
          </Text>
          <SyncStatus app={app} />
        </Group>
      </Stack>
    </Group>
  );
}

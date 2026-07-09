import { t } from "ttag";

import { Group, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataApp } from "metabase-types/api";

import { DataAppAllowedHosts } from "./DataAppAllowedHosts";
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
        {app.enabled ? (
          <Text
            component="a"
            href={Urls.getSubpathSafeUrl(Urls.dataApp(app.name))}
            target="_blank"
            rel="noreferrer"
            fw={700}
            c="brand"
          >
            {app.display_name}
          </Text>
        ) : (
          // Disabled apps aren't reachable (the route 404s), so the name is
          // plain text rather than a dead link.
          <Text fw={700} c="text-secondary">
            {app.display_name}
          </Text>
        )}
        <Group gap="xs" align="center">
          <Text size="sm" c="text-tertiary" ff="monospace">
            {Urls.dataApp(app.name)}
          </Text>
          <Text size="sm" c="text-tertiary">
            &bull;
          </Text>
          <SyncStatus app={app} />
        </Group>
        <DataAppAllowedHosts hosts={app.allowed_hosts} />
      </Stack>
    </Group>
  );
}

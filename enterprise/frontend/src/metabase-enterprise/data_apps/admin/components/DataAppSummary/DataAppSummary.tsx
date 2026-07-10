import { t } from "ttag";

import { Group, Stack, Text } from "metabase/ui";
import type { MetabaseColorKey } from "metabase/ui/colors/types";
import * as Urls from "metabase/urls";
import type { DataApp } from "metabase-types/api";

import { DataAppAllowedHosts } from "../DataAppAllowedHosts/DataAppAllowedHosts";
import { DataAppIcon } from "../DataAppIcon/DataAppIcon";

type Props = {
  app: DataApp;
};

const Bullet = () => (
  <Text size="sm" c="text-secondary" aria-hidden>
    &bull;
  </Text>
);

function getSyncStatus({ sync_error, last_synced_sha }: DataApp): {
  label: string;
  color: MetabaseColorKey;
  title?: string;
} {
  if (sync_error) {
    return { label: t`Sync failed`, color: "error", title: sync_error };
  }

  if (last_synced_sha) {
    return {
      label: t`Synced ${last_synced_sha.slice(0, 7)}`,
      color: "text-secondary",
    };
  }

  return { label: t`Not synced yet`, color: "text-tertiary" };
}

const SyncStatus = ({ app }: Props) => {
  const { label, color, title } = getSyncStatus(app);

  return (
    <Text size="sm" c={color} title={title} lh="1.4">
      {label}
    </Text>
  );
};

export const DataAppSummary = ({ app }: Props) => (
  <Group align="center" flex="1" wrap="nowrap" miw={0}>
    <DataAppIcon />

    <Stack flex="1" gap={2} miw={0}>
      {app.enabled ? (
        <Text
          component="a"
          href={Urls.getSubpathSafeUrl(Urls.dataApp(app.name))}
          target="_blank"
          rel="noreferrer"
          fw={700}
          lh="1.4"
          c="brand"
          truncate
        >
          {app.display_name}
        </Text>
      ) : (
        <Text fw={700} lh="1.4" c="text-secondary" truncate>
          {app.display_name}
        </Text>
      )}

      <Group gap="xs" align="center" wrap="wrap">
        <Text
          size="sm"
          c="text-secondary"
          ff="monospace"
          lh="1.4"
          truncate
          maw="100%"
        >
          {Urls.dataApp(app.name)}
        </Text>

        <Bullet />

        <SyncStatus app={app} />

        {app.allowed_hosts.length > 0 && (
          <>
            <Bullet />

            <DataAppAllowedHosts hosts={app.allowed_hosts} />
          </>
        )}
      </Group>
    </Stack>
  </Group>
);

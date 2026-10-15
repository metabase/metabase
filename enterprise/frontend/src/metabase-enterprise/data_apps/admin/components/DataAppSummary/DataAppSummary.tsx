import { t } from "ttag";

import { Group, Stack, Text } from "metabase/ui";
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

export const DataAppSummary = ({ app }: Props) => {
  const isOpenable = app.enabled && !app.draft && !app.outdated;

  return (
    <Group align="center" flex="1" wrap="nowrap" miw={0}>
      <DataAppIcon />

      <Stack flex="1" gap={2} miw={0}>
        {isOpenable ? (
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

        {app.description && (
          <Text size="sm" c="text-secondary" lh="1.4" my="xxs">
            {app.description}
          </Text>
        )}

        <Group gap="xxs" align="center" wrap="wrap">
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

          {app.draft && (
            <>
              <Bullet />

              <Text size="sm" c="text-tertiary" lh="1.4">
                {t`Draft`}
              </Text>
            </>
          )}

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
};

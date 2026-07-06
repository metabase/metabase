import { t } from "ttag";

import { Group, Stack, Text } from "metabase/ui";
import type { CustomVizPlugin } from "metabase-types/api";

import { CustomVizIcon } from "./CustomVizIcon";

type Props = {
  plugin: CustomVizPlugin;
};

export function CustomVizPluginSummary({ plugin }: Props) {
  return (
    <Group align="flex-start" flex="1" wrap="nowrap">
      <CustomVizIcon plugin={plugin} />
      <Stack flex="1" gap="xs" py="xs">
        <Text fw={700}>{plugin.display_name}</Text>
        {(plugin.bundle_hash || plugin.metabase_version) && (
          <Group gap="xs">
            {plugin.bundle_hash && (
              <Text size="sm" c="text-disabled">
                {t`Bundle: ${plugin.bundle_hash.slice(0, 8)}`}
              </Text>
            )}
            {plugin.bundle_hash && plugin.metabase_version && (
              <Text size="sm" c="text-disabled">
                &bull;
              </Text>
            )}
            {plugin.metabase_version && (
              <Text size="sm" c="text-disabled">
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page */}
                {t`Requires Metabase ${plugin.metabase_version}`}
              </Text>
            )}
          </Group>
        )}
        {plugin.error_message && (
          <Text size="sm" c="error">
            {plugin.error_message}
          </Text>
        )}
      </Stack>
    </Group>
  );
}

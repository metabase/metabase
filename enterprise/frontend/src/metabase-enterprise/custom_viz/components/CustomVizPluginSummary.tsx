import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Group, Icon, Stack, Text } from "metabase/ui";
import type { CustomVizPlugin } from "metabase-types/api";

import { CustomVizIcon } from "./CustomVizIcon";
import {
  SDK_CHANGELOG_URL,
  getCustomVizPluginWarningMessage,
} from "./warning-messages";

type Props = {
  plugin: CustomVizPlugin;
};

export function CustomVizPluginSummary({ plugin }: Props) {
  return (
    <Group align="flex-start" flex="1" wrap="nowrap">
      <CustomVizIcon plugin={plugin} />

      <Stack flex="1" gap="sm" py="xs">
        <Stack flex="1" gap="xs">
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
        </Stack>

        {plugin.error_message && (
          <Text size="sm" c="feedback-negative">
            {plugin.error_message}
          </Text>
        )}

        {plugin.warnings.map((warning) => (
          <Group align="center" gap="xs" key={warning.type} wrap="nowrap">
            <Icon c="warning" flex="0 0 auto" name="warning" />

            <Text c="text-secondary" size="sm">
              {getCustomVizPluginWarningMessage(warning)}

              {warning.type === "sdk-version-mismatch" && (
                <>
                  {" "}
                  <ExternalLink href={SDK_CHANGELOG_URL}>
                    {t`See the SDK changelog`}
                  </ExternalLink>
                  .
                </>
              )}
            </Text>
          </Group>
        ))}
      </Stack>
    </Group>
  );
}

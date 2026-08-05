import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { Group, Icon, Stack, Text } from "metabase/ui";

/**
 * Rendered on the admin embedding index until the embedding hub replaced it.
 * It is a static informational card rather than a setting, and it is about the
 * instance rather than about embedding configuration, so it lands here instead
 * of on a hub tab.
 */
export function VersionPinningSetting() {
  const isReactSdkFeatureAvailable = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isHosted = useSetting("is-hosted?");

  if (!isReactSdkFeatureAvailable || !isHosted) {
    return null;
  }

  return (
    <SettingsSection>
      <Stack gap="xs">
        <Text
          htmlFor="version-pinning"
          component="label"
          c="text-primary"
          fw="bold"
          fz="lg"
        >
          {t`Version pinning`}
        </Text>

        <Text c="text-secondary" lh="lg" mb="sm">
          {t`Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.`}
        </Text>

        <ExternalLink href="mailto:help@metabase.com">
          <Group gap="sm" fw="bold" w="fit-content">
            <Icon name="mail" size={14} aria-hidden />
            <span>{t`Request version pinning`}</span>
          </Group>
        </ExternalLink>
      </Stack>
    </SettingsSection>
  );
}

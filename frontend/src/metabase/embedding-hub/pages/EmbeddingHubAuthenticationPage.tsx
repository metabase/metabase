import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellEmbeddingSso } from "metabase/admin/upsells";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { Card, Group, Icon, Text } from "metabase/ui";

/**
 * A JWT-only view of the authentication settings. The admin authentication
 * page does not change -- this is a second view onto the same settings.
 *
 * The admin JWT card is mounted as-is, which is what brings User provisioning
 * along: it is part of SettingsJWTForm, and its absence from the mockup is the
 * mockup being a sketch.
 */
export function EmbeddingHubAuthenticationPage() {
  const hasSsoJwt = useHasTokenFeature("sso_jwt");

  if (!hasSsoJwt) {
    return (
      <SettingsPageWrapper title={t`Authentication`}>
        <UpsellEmbeddingSso source="embedding-hub-authentication" />
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper title={t`Authentication`}>
      <PLUGIN_AUTH_PROVIDERS.SettingsJWTForm />

      <OtherAuthMethodsBanner />
    </SettingsPageWrapper>
  );
}

/**
 * After the admin embedding section is removed this is the only route from the
 * hub to the other SSO methods, so the link is functional rather than
 * decoration. A single banner, not admin's RelatedSettingsSection grid -- that
 * grid is in no hub frame.
 */
function OtherAuthMethodsBanner() {
  return (
    <Card p="md" withBorder bg="background-brand">
      <Group gap="xs" wrap="nowrap">
        <Text c="text-secondary">
          {t`View more authentication options, such as SAML, in the`}
        </Text>

        <Link to="/admin/settings/authentication">
          <Group gap={4} wrap="nowrap">
            <Text c="brand" fw="bold">{t`Admin settings`}</Text>
            <Icon name="external" size={12} c="brand" />
          </Group>
        </Link>
      </Group>
    </Card>
  );
}

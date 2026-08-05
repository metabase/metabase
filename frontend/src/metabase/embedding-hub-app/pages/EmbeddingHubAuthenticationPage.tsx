import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellSSO } from "metabase/admin/upsells";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { Anchor, Stack, Text } from "metabase/ui";

/**
 * A JWT-only view of the authentication settings. The admin authentication
 * page does not change -- this is a second view onto the same settings.
 *
 * The admin JWT card is mounted as-is, which is what brings User provisioning
 * along: it is part of SettingsJWTForm, and its absence from the mockup is the
 * mockup being a sketch. Regenerate behaves exactly as it does in admin;
 * softening that edge is a change to the admin card, not to this tab.
 *
 * After the admin embedding section is removed this tab is the only route from
 * the hub to the other SSO methods, so the link out is functional rather than
 * decoration. It is a single link, not admin's RelatedSettingsSection grid --
 * that grid is in no hub frame.
 */
export function EmbeddingHubAuthenticationPage() {
  const hasSsoJwt = useHasTokenFeature("sso_jwt");

  if (!hasSsoJwt) {
    return <UpsellSSO location="embedding-hub-authentication" />;
  }

  return (
    <SettingsPageWrapper title={t`Authentication`}>
      <PLUGIN_AUTH_PROVIDERS.SettingsJWTForm />

      <Stack gap="xs">
        <Text c="text-secondary">
          {t`SAML, OIDC, Google and LDAP are configured in admin.`}
        </Text>
        <Anchor component={Link} to="/admin/settings/authentication">
          {t`Go to authentication settings`}
        </Anchor>
      </Stack>
    </SettingsPageWrapper>
  );
}

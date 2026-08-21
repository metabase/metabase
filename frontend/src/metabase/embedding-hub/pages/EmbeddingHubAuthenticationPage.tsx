import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { useGetAdminSettingsDetailsQuery, useSetting } from "metabase/settings";
import { Card, Group, Icon, Stack, Text, Title } from "metabase/ui";

import { AuthenticationUpsellPage } from "../upsells";

const ADMIN_AUTHENTICATION_URL = "/admin/settings/authentication";

/**
 * A JWT-only view of the authentication settings. The admin authentication
 * page does not change -- this is a second view onto the same settings.
 *
 * Only JWT and SAML count as configured SSO here, because those are the only
 * two an embed can drive: /auth/sso resolves to one or the other
 * (sso/api/interface.clj), and the SDK's auth-common ships a jwt and a saml
 * path and nothing else. OIDC, Google and LDAP sign people into Metabase
 * itself, so they are linked out with the rest.
 */
export function EmbeddingHubAuthenticationPage() {
  const hasSsoJwt = useHasTokenFeature("sso_jwt");

  // The JWT form gates on this same query, and it is the only thing on the
  // page that loads. Waiting for it here keeps the rest of the page from
  // sitting next to the form's spinner. Same endpoint, no args, so both hooks
  // share one cache entry -- this is a second subscriber, not a second
  // request.
  const { isLoading } = useGetAdminSettingsDetailsQuery();

  // `jwt-configured` is optional in the settings schema, unlike its SAML peer.
  const isJwtConfigured = useSetting("jwt-configured") ?? false;
  const isSamlConfigured = useSetting("saml-configured");

  if (!hasSsoJwt) {
    return (
      <SettingsPageWrapper title={t`Authentication`}>
        <AuthenticationUpsellPage source="embedding-hub-authentication" />
      </SettingsPageWrapper>
    );
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <SettingsPageWrapper title={t`Authentication`}>
      <AuthenticationSection
        isJwtConfigured={isJwtConfigured}
        isSamlConfigured={isSamlConfigured}
      />
    </SettingsPageWrapper>
  );
}

function AuthenticationSection({
  isJwtConfigured,
  isSamlConfigured,
}: {
  isJwtConfigured: boolean;
  isSamlConfigured: boolean;
}) {
  // No banner on the SAML card: its own Go to Admin points at the same page,
  // and two links to one place read as two different destinations.
  if (!isJwtConfigured && isSamlConfigured) {
    return <SamlConfiguredCard />;
  }

  // The standard JWT form, configured or not. Setting JWT up from scratch has
  // its own stepped flow, but that belongs to the setup guide rather than
  // here -- Alessio, 2026-08-21.
  return (
    <>
      <PLUGIN_AUTH_PROVIDERS.SettingsJWTForm title={null} />
      <OtherAuthMethodsBanner />
    </>
  );
}

/**
 * JWT wins whenever it is configured, so this is only ever the SAML-only
 * instance: SSO already works, and everything it needs lives in admin.
 */
function SamlConfiguredCard() {
  return (
    <Card p="xl" withBorder>
      <Stack gap="md">
        <Title order={2}>{t`SAML is configured`}</Title>

        <Text c="text-secondary">
          {t`You can review all authentication settings in the Admin.`}
        </Text>

        <Group justify="flex-end">
          <Link to={ADMIN_AUTHENTICATION_URL}>
            <Group gap={4} wrap="nowrap">
              <Text c="brand" fw="bold">{t`Go to Admin`}</Text>
              <Icon name="external" size={12} c="brand" />
            </Group>
          </Link>
        </Group>
      </Stack>
    </Card>
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
      <Group gap="xs">
        <Text c="text-secondary">
          {t`View more authentication options, such as SAML, in the`}
        </Text>

        <Link to={ADMIN_AUTHENTICATION_URL}>
          <Group gap={4} wrap="nowrap">
            <Text c="brand" fw="bold">{t`Admin settings`}</Text>
            <Icon name="external" size={12} c="brand" />
          </Group>
        </Link>
      </Group>
    </Card>
  );
}

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
 * Only JWT and SAML count as configured SSO here, because embedding supports
 * only those two.
 */
export function EmbeddingHubAuthenticationPage() {
  const hasSsoJwt = useHasTokenFeature("sso_jwt");

  // Same endpoint and args as the JWT form, so this is a second subscriber to
  // one cache entry, not a second request. Gating here keeps the page from
  // painting beside the form's spinner.
  const { isLoading } = useGetAdminSettingsDetailsQuery();

  // `jwt-configured` is optional in metabase-types/api/settings.ts, unlike its
  // SAML peer.
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  if (!hasSsoJwt) {
    return (
      <SettingsPageWrapper title={t`Authentication`}>
        <AuthenticationUpsellPage />
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
  isJwtConfigured: boolean | undefined;
  isSamlConfigured: boolean;
}) {
  // No banner on the SAML card: its own Go to Admin points at the same page,
  // and two links to one place read as two different destinations.
  if (!isJwtConfigured && isSamlConfigured) {
    return <SamlConfiguredCard />;
  }

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

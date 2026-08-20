import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellEmbeddingSso } from "metabase/admin/upsells";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { useGetAdminSettingsDetailsQuery, useSetting } from "metabase/settings";
import {
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Image,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";

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
        <UpsellEmbeddingSso source="embedding-hub-authentication" />
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
  if (isJwtConfigured) {
    return (
      <>
        <PLUGIN_AUTH_PROVIDERS.SettingsJWTForm />
        <OtherAuthMethodsBanner />
      </>
    );
  }

  // No banner here: the card's own Go to Admin already points at the same
  // page, and two links to one place read as two different destinations.
  if (isSamlConfigured) {
    return <SamlConfiguredCard />;
  }

  return (
    <>
      <ConfigureJwtCard />
      <OtherAuthMethodsBanner />
    </>
  );
}

/**
 * Setup goes through the guide's JWT wizard rather than dropping the admin
 * straight into the form -- it is the flow Get started already uses, and it
 * covers the endpoint and the test as well as the settings. It is mounted
 * under this tab, so finishing it comes back here.
 */
function ConfigureJwtCard() {
  return (
    <Card p="xl" withBorder>
      <Flex align="center" gap="xl" wrap="wrap">
        <Stack gap="md" align="flex-start" flex="1 1 20rem">
          <Title order={2}>{t`Configure JWT authentication`}</Title>

          <Text c="text-secondary">
            {t`You can connect Metabase to your identity provider using JSON Web Tokens (JWT) to authenticate people. Configure JWT authentication to ensure only authorized users can access your embeds.`}
          </Text>

          <Button
            component={Link}
            to={Urls.embeddingHubAuthenticationSsoSetup()}
            variant="filled"
          >
            {t`Configure JWT`}
          </Button>
        </Stack>

        <Paper bg="background-brand" radius="md" p="lg" flex="1 1 20rem">
          <Image
            src="app/assets/img/upsell-embedding-sso.svg"
            alt=""
            fit="contain"
            h="13rem"
          />
        </Paper>
      </Flex>
    </Card>
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

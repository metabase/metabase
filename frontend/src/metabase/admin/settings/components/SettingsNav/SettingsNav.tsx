import { t } from "ttag";

import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Divider, Flex, Text } from "metabase/ui";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "../AdminNav";

const NavDivider = () => <Divider my="sm" />;

export function SettingsNav() {
  const hasHosting = useHasTokenFeature("hosting");
  const hasEmbedding = useHasTokenFeature("embedding");
  const hasWhitelabel = useHasTokenFeature("whitelabel");
  const hasSaml = useHasTokenFeature("sso_saml");
  const hasJwt = useHasTokenFeature("sso_jwt");
  const hasScim = useHasTokenFeature("scim");

  return (
    <AdminNavWrapper>
      <SettingsNavItem path="general" label={t`General`} icon="gear" />
      <SettingsNavItem
        path="authentication"
        label={t`Authentication`}
        icon="lock"
      >
        <SettingsNavItem path="authentication" label={t`Overview`} />
        {hasScim && (
          <SettingsNavItem
            path="authentication/user-provisioning"
            label={t`User provisioning`}
          />
        )}
        <SettingsNavItem path="authentication/api-keys" label={t`API keys`} />
        <SettingsNavItem path="authentication/google" label={t`Google auth`} />
        <SettingsNavItem path="authentication/ldap" label="LDAP" />
        {hasSaml && <SettingsNavItem path="authentication/saml" label="SAML" />}
        {hasJwt && <SettingsNavItem path="authentication/jwt" label="JWT" />}
      </SettingsNavItem>
      <NavDivider />
      <SettingsNavItem path="email" label={t`Email`} icon="mail" />
      <SettingsNavItem
        path="notifications"
        label={t`Notification channels`}
        icon="bell"
      />
      {!hasHosting && (
        <SettingsNavItem path="updates" label={t`Updates`} icon="sparkles" />
      )}
      <NavDivider />
      <SettingsNavItem
        path="localization"
        label={t`Localization`}
        icon="globe"
      />
      <SettingsNavItem path="maps" label={t`Maps`} icon="pinmap" />
      <SettingsNavItem
        path="whitelabel"
        label={
          <Flex gap="sm" align="center">
            <Text>{t`Appearance`}</Text>
            {!hasWhitelabel && <UpsellGem />}
          </Flex>
        }
        icon="palette"
      >
        {hasWhitelabel && (
          <>
            <SettingsNavItem path="whitelabel/branding" label={t`Branding`} />
            <SettingsNavItem
              path="whitelabel/conceal-metabase"
              label={t`Conceal Metabase`}
            />
          </>
        )}
      </SettingsNavItem>
      <NavDivider />
      <SettingsNavItem path="uploads" label={t`Uploads`} icon="upload" />
      <SettingsNavItem
        path="public-sharing"
        label={t`Public sharing`}
        icon="share"
      />
      <SettingsNavItem
        path="embedding-in-other-applications"
        label={t`Embedding`}
        icon="embed"
      >
        <SettingsNavItem
          path="embedding-in-other-applications"
          label={t`Overview`}
        />
        <SettingsNavItem
          path="embedding-in-other-applications/standalone"
          label={t`Static embedding`}
        />
        {hasEmbedding && (
          <SettingsNavItem
            path="embedding-in-other-applications/full-app"
            label={t`Interactive embedding`}
          />
        )}
        <SettingsNavItem
          path="embedding-in-other-applications/sdk"
          label={t`Embedding SDK`}
        />
      </SettingsNavItem>
      <NavDivider />
      <SettingsNavItem path="license" label={t`License`} icon="store" />
      <SettingsNavItem
        path="cloud"
        label={
          <Flex gap="sm" align="center">
            <Text>{t`Cloud`}</Text>
            {!hasHosting && <UpsellGem />}
          </Flex>
        }
        icon="cloud"
      />
    </AdminNavWrapper>
  );
}

function SettingsNavItem({ path, ...navItemProps }: AdminNavItemProps) {
  return (
    <AdminNavItem
      data-testid={`settings-sidebar-link`}
      path={`/admin/settings/${path}`}
      {...navItemProps}
    />
  );
}

import { t } from "ttag";

import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useHasTokenFeature } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import {
  Divider,
  Flex,
  Icon,
  type IconName,
  NavLink,
  type NavLinkProps,
  Stack,
  Text,
} from "metabase/ui";
import type { TokenFeature } from "metabase-types/api";

const NavDivider = () => <Divider my="sm" />;

export function SettingsNav() {
  const hasHosting = useHasTokenFeature("hosting");
  const hasEmbedding = useHasTokenFeature("embedding");
  const hasWhitelabel = useHasTokenFeature("whitelabel");
  const hasSaml = useHasTokenFeature("sso_saml");
  const hasJwt = useHasTokenFeature("sso_jwt");
  const hasScim = useHasTokenFeature("scim");

  return (
    <Stack w="16rem" gap="xs" bg="white" p="md" h="100%">
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
        {hasSaml && (
          <SettingsNavItem
            path="authentication/saml"
            label="SAML"
            requiresFeature="sso_saml"
          />
        )}
        {hasJwt && (
          <SettingsNavItem
            path="authentication/jwt"
            label="JWT"
            requiresFeature="sso_jwt"
          />
        )}
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
            <SettingsNavItem
              path="whitelabel/branding"
              label={t`Branding`}
              requiresFeature="whitelabel"
            />
            <SettingsNavItem
              path="whitelabel/conceal-metabase"
              label={t`Conceal Metabase`}
              requiresFeature="whitelabel"
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
            requiresFeature={"embedding"}
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
    </Stack>
  );
}

function SettingsNavItem({
  path,
  label,
  icon,
  requiresFeature,
  ...navLinkProps
}: { path: string; icon?: IconName; requiresFeature?: TokenFeature } & Omit<
  NavLinkProps,
  "href"
>) {
  const location = useSelector(getLocation);
  const subpath = location?.pathname?.replace?.("/admin/settings/", "");

  // TODO: render active if collapsed and child is active

  return (
    <NavLink
      component={Link}
      to={`/admin/settings/${path}`}
      defaultOpened={subpath.includes(path)}
      active={path === subpath}
      variant="admin-nav"
      label={label}
      {...(icon ? { leftSection: <Icon name={icon} /> } : undefined)}
      {...navLinkProps}
    />
  );
}

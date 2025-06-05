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

export function SettingsNav() {
  const hasHosting = useHasTokenFeature("hosting");

  return (
    <Stack w="16rem" gap="xs" bg="white" p="md" h="100%">
      <SettingsNavItem path="general" label={t`General`} icon="gear" />
      <SettingsNavItem
        path="authentication"
        label={t`Authentication`}
        icon="lock"
      >
        <SettingsNavItem
          path="authentication/user-provisioning"
          label={t`User Provisioning`}
        />
        <SettingsNavItem path="authentication/api-keys" label={t`Api Keys`} />
        <SettingsNavItem path="authentication/google" label={t`Google Auth`} />
        <SettingsNavItem path="authentication/ldap" label="LDAP" />
        <SettingsNavItem path="authentication/saml" label="SAML" />
        <SettingsNavItem path="authentication/jwt" label="JWT" />
      </SettingsNavItem>
      <Divider />
      <SettingsNavItem path="email" label={t`Email`} icon="mail">
        <SettingsNavItem path="email/smtp" label="SMTP" />
      </SettingsNavItem>
      <SettingsNavItem
        path="notifications"
        label={t`Notification channels`}
        icon="bell"
      >
        <SettingsNavItem path="notifications/slack" label="Slack" />
      </SettingsNavItem>
      <SettingsNavItem
        path="updates"
        label={t`Updates`}
        hidden={hasHosting}
        icon="sparkles"
      />
      <Divider />
      <SettingsNavItem path="maps" label={t`Maps`} icon="pinmap" />
      <SettingsNavItem
        path="localization"
        label={t`Localization`}
        icon="globe"
      />
      <SettingsNavItem path="whitelabel" label={t`Appearance`} icon="palette">
        <SettingsNavItem path="whitelabel/branding" label={t`Branding`} />
        <SettingsNavItem
          path="whitelabel/conceal-metabase"
          label={t`Conceal Metabase`}
        />
      </SettingsNavItem>
      <Divider />
      <SettingsNavItem path="uploads" label={t`Uploads`} icon="upload" />
      <SettingsNavItem
        path="public-sharing"
        label={t`Public Sharing`}
        icon="share"
      />
      <SettingsNavItem
        path="embedding-in-other-applications"
        label={t`Embedding`}
        icon="embed"
      >
        <SettingsNavItem
          path="embedding-in-other-applications/standalone"
          label={t`Static Embedding`}
        />
        <SettingsNavItem
          path="embedding-in-other-applications/full-app"
          label={t`Interactive Embedding`}
        />
        <SettingsNavItem
          path="embedding-in-other-applications/sdk"
          label={t`Embedding SDK`}
        />
      </SettingsNavItem>
      <Divider />
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
        rightSection={hasHosting ? <UpsellGem /> : undefined}
      />
    </Stack>
  );
}

function SettingsNavItem({
  path,
  label,
  hidden,
  icon,
  ...navLinkProps
}: { path: string; hidden?: boolean; icon?: IconName } & Omit<
  NavLinkProps,
  "href"
>) {
  const location = useSelector(getLocation);
  const subpath = location?.pathname?.replace?.("/admin/settings/", "");

  if (hidden) {
    return null;
  }

  const activeBit = subpath.split("/")[0];

  return (
    <NavLink
      component={Link}
      to={`/admin/settings/${path}`}
      active={path === activeBit}
      variant="admin-nav"
      label={label}
      {...(icon ? { leftSection: <Icon name={icon} /> } : undefined)}
      {...navLinkProps}
    />
  );
}

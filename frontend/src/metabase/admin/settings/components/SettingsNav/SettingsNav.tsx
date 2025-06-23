import { useDisclosure } from "@mantine/hooks";
import React, { type ReactElement } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Divider, Flex } from "metabase/ui";

import { UpdatesNavItem } from "./UpdatesNavItem";

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
      <SettingsNavItem label={t`Authentication`} path="auth" icon="lock">
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
      {!hasHosting && <UpdatesNavItem />}
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
            <span>{t`Appearance`}</span>
            {!hasWhitelabel && <UpsellGem />}
          </Flex>
        }
        icon="palette"
      >
        {hasWhitelabel && [
          // using an array so that child path detection can access them as direct children
          <SettingsNavItem
            key="branding"
            path="whitelabel/branding"
            label={t`Branding`}
          />,
          <SettingsNavItem
            key="conceal"
            path="whitelabel/conceal-metabase"
            label={t`Conceal Metabase`}
          />,
        ]}
      </SettingsNavItem>
      <NavDivider />
      <SettingsNavItem path="uploads" label={t`Uploads`} icon="upload" />
      <SettingsNavItem
        path="public-sharing"
        label={t`Public sharing`}
        icon="share"
      />
      <SettingsNavItem path="embedding" label={t`Embedding`} icon="embed">
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
            <span>{t`Cloud`}</span>
            {!hasHosting && <UpsellGem />}
          </Flex>
        }
        icon="cloud"
      />
    </AdminNavWrapper>
  );
}

const hasActiveChild = (children: ReactElement[], pathname: string) =>
  children.length > 0 &&
  children.some(
    (child) => child?.props?.path && pathname.includes(child.props.path),
  );

export function SettingsNavItem({ path, ...navItemProps }: AdminNavItemProps) {
  const children = React.Children.toArray(
    navItemProps.children,
  ) as ReactElement[];
  const currentPath: string = useSelector(getLocation)?.pathname ?? "";
  const [isOpen, { toggle: toggleOpen }] = useDisclosure(
    currentPath.includes(path),
  );

  const showActive =
    (!isOpen && hasActiveChild(children, currentPath)) ||
    currentPath === `/admin/settings/${path}`;

  return (
    <AdminNavItem
      data-testid={`settings-sidebar-link`}
      path={`/admin/settings/${path}`}
      opened={isOpen}
      active={showActive}
      onClick={toggleOpen}
      {...navItemProps}
    />
  );
}

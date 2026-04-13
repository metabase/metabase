import { useDisclosure } from "@mantine/hooks";
import React, { type ReactElement } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Divider, Flex } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";

import { UpdatesNavItem } from "./UpdatesNavItem";

const NavDivider = () => <Divider my="sm" />;

export function SettingsNav() {
  const hasHosting = useHasTokenFeature("hosting");
  const hasWhitelabel = useHasTokenFeature("whitelabel");
  const hasSaml = useHasTokenFeature("sso_saml");
  const hasJwt = useHasTokenFeature("sso_jwt");
  const hasOidc = useHasTokenFeature("sso_oidc");
  const hasScim = useHasTokenFeature("scim");
  const hasPythonTransforms = useHasTokenFeature("transforms-python");
  const isHosted = useSetting("is-hosted?");
  const hasCustomViz = useHasTokenFeature("custom-viz");
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <AdminNavWrapper>
      <SettingsNavItem path="general" label={t`General`} icon="gear" />
      <SettingsNavItem
        label={t`Authentication`}
        icon="lock"
        folderPattern="auth"
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
        {hasOidc && <SettingsNavItem path="authentication/oidc" label="OIDC" />}
      </SettingsNavItem>
      <PLUGIN_REMOTE_SYNC.LibraryNav />
      <NavDivider />
      <SettingsNavItem path="email" label={t`Email`} icon="mail" />
      <SettingsNavItem path="slack" label={t`Slack`} icon="slack" />
      <SettingsNavItem path="webhooks" label={t`Webhooks`} icon="webhook" />
      {!hasHosting && <UpdatesNavItem />}
      <NavDivider />
      <SettingsNavItem
        path="localization"
        label={t`Localization`}
        icon="globe"
      />
      {/* do not allow users with "Settings access" permissions to access custom viz pages */}
      {isAdmin && (
        <SettingsNavItem
          path={!hasCustomViz ? "custom-visualizations" : undefined}
          folderPattern="custom-visualizations"
          label={
            <Flex gap="sm" align="center">
              <span>{t`Custom visualizations`}</span>
              {!hasCustomViz && <UpsellGem />}
            </Flex>
          }
          icon="bar"
        >
          {hasCustomViz && [
            <SettingsNavItem
              key="manage"
              path="custom-visualizations"
              label={t`Manage visualizations`}
            />,
            <SettingsNavItem
              key="dev"
              path="custom-visualizations/development"
              label={t`Development`}
            />,
          ]}
        </SettingsNavItem>
      )}
      <SettingsNavItem path="maps" label={t`Maps`} icon="pinmap" />
      <SettingsNavItem
        path={!hasWhitelabel ? "whitelabel" : undefined}
        folderPattern="whitelabel"
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
      {/* Python Runner settings are managed by Metabase Cloud for hosted instances */}
      {hasPythonTransforms && !isHosted && (
        <SettingsNavItem
          path="python-runner"
          label={t`Python Runner`}
          icon="snippet"
        />
      )}
      <SettingsNavItem
        path="public-sharing"
        label={t`Public sharing`}
        icon="share"
      />
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

/**
 * Find the child whose path is the best (longest) prefix match for the current
 * pathname, or null if no child matches at all. An exact match always wins.
 */
const findBestMatchingChild = (
  children: ReactElement[],
  pathname: string,
): ReactElement | null => {
  let best: ReactElement | null = null;
  let bestLen = 0;

  for (const child of children) {
    const childPath = child?.props?.path as string | undefined;
    if (!childPath) {
      continue;
    }
    const full = `/admin/settings/${childPath}`;
    if (pathname === full || pathname.startsWith(`${full}/`)) {
      if (full.length > bestLen) {
        best = child;
        bestLen = full.length;
      }
    }
  }

  return best;
};

export function SettingsNavItem({
  path,
  folderPattern,
  active: activeOverride,
  children: childrenProp,
  ...navItemProps
}: AdminNavItemProps & { active?: boolean }) {
  const children = React.Children.toArray(childrenProp) as ReactElement[];
  const currentPath: string = useSelector(getLocation)?.pathname ?? "";
  const [isOpen, { toggle: toggleOpen }] = useDisclosure(
    folderPattern ? currentPath.includes(folderPattern) : false,
  );

  const bestChild = findBestMatchingChild(children, currentPath);
  const hasActiveDescendant = bestChild != null;

  const fullPath = `/admin/settings/${path}`;
  const showActive =
    activeOverride ??
    ((!isOpen && hasActiveDescendant) || currentPath === fullPath);

  return (
    <AdminNavItem
      data-testid={`settings-sidebar-link`}
      path={path ? `/admin/settings/${path}` : ""}
      folderPattern={folderPattern}
      opened={isOpen}
      active={showActive}
      onClick={toggleOpen}
      {...navItemProps}
    >
      {children.length > 0
        ? children.map((child) =>
            child?.props?.path
              ? React.cloneElement(child, {
                  active: child === bestChild,
                } as any)
              : child,
          )
        : childrenProp}
    </AdminNavItem>
  );
}

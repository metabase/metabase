import { t } from "ttag";

import { useEnsureDefaultEmbeddingThemes } from "metabase/admin/embedding/hooks";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { AreaLayout, AreaTab } from "metabase/nav/components/AreaLayout";
import { Outlet, useLocation } from "metabase/router";
import { FixedSizeIcon, Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { EmbeddingHubContent } from "./EmbeddingHubContent";

type EmbeddingHubTab = {
  label: string;
  icon: IconName;
  to: string;
  isGated?: boolean;
};

// Two things need the whole area: the theme editor, which puts its editor panel
// and live preview side by side (the trailing slash keeps the theme *list*
// capped), and the permissions editor, which is a full-width app of its own.
// Every other page is capped at 800px, per the design.
const FULL_WIDTH_PATH_PREFIXES = [
  `${Urls.embeddingHubAppearance()}/`,
  Urls.embeddingHubPermissions(),
];

function isFullWidthPath(pathname: string) {
  return FULL_WIDTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// The setup wizard's two sub-pages belong to Get started, so they keep that
// tab selected rather than leaving the nav with nothing lit.
const GET_STARTED_PATHS = [
  `${Urls.embeddingHub()}/permissions-setup`,
  `${Urls.embeddingHub()}/sso-setup`,
];

function isTabSelected(tab: EmbeddingHubTab, pathname: string) {
  // Get started is the index route, so a prefix match would claim every other
  // tab's path.
  if (tab.to === Urls.embeddingHub()) {
    return pathname === tab.to || GET_STARTED_PATHS.includes(pathname);
  }

  // Match whole path segments, not a string prefix: /embedding/permissions-setup
  // starts with the Permissions tab's path and would otherwise light it up.
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

export function EmbeddingHubLayout() {
  const {
    value: navbarOpenedValue,
    setValue: setIsNavbarOpened,
    isLoading: isLoadingNavbarKey,
  } = useUserKeyValue({
    namespace: "embedding_hub",
    key: "isNavbarOpened",
  });
  const isNavbarOpened = navbarOpenedValue !== false;

  const { pathname } = useLocation();
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasSsoJwt = useHasTokenFeature("sso_jwt");
  const hasTenants = useHasTokenFeature("tenants");

  useEnsureDefaultEmbeddingThemes();

  // Order comes from the design; see 01-questions-for-roman.md for what each tab holds.
  const tabs: EmbeddingHubTab[] = [
    { label: t`Get started`, icon: "list", to: Urls.embeddingHub() },
    {
      label: t`Security`,
      icon: "shield_outline",
      to: Urls.embeddingHubSecurity(),
    },
    {
      label: t`Authentication`,
      icon: "lock",
      to: Urls.embeddingHubAuthentication(),
      isGated: !hasSsoJwt,
    },
    { label: t`Permissions`, icon: "key", to: Urls.embeddingHubPermissions() },
    {
      label: t`Tenancy`,
      icon: "group",
      to: Urls.embeddingHubTenancy(),
      isGated: !hasTenants,
    },
    {
      label: t`Appearance`,
      icon: "palette",
      to: Urls.embeddingHubAppearance(),
      isGated: !hasSimpleEmbedding,
    },
    {
      label: t`Localization`,
      icon: "globe",
      to: Urls.embeddingHubLocalization(),
    },
  ];

  const upperNav = (
    <Stack component="nav" gap="0.75rem" aria-label={t`Embedding hub`}>
      {tabs.map((tab) => (
        <AreaTab
          key={tab.to}
          label={tab.label}
          icon={tab.icon}
          to={tab.to}
          isSelected={isTabSelected(tab, pathname)}
          isGated={tab.isGated}
          showLabel={isNavbarOpened}
        />
      ))}
    </Stack>
  );

  return (
    <AreaLayout
      logo={
        <Flex
          bdrs="50%"
          bg="background_surface-brand-subtle"
          w="2rem"
          h="2rem"
          align="center"
          justify="center"
        >
          <FixedSizeIcon name="embed" size={14} c="brand" />
        </Flex>
      }
      testId="embedding-hub-nav"
      isLoading={isLoadingNavbarKey}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      upperNav={upperNav}
    >
      <EmbeddingHubContent fullWidth={isFullWidthPath(pathname)}>
        <Outlet />
      </EmbeddingHubContent>
    </AreaLayout>
  );
}

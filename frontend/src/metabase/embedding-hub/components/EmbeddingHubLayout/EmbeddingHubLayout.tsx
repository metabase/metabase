import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/current-user";
import { useEnsureDefaultEmbeddingThemes } from "metabase/embedding/themes/hooks";
import {
  AreaLayout,
  AreaNavButton,
  AreaTab,
} from "metabase/nav/components/AreaLayout";
import { Outlet, useLocation, useNavigate } from "metabase/router";
import { FixedSizeIcon, Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { EmbeddingHubContent } from "./EmbeddingHubContent";

type EmbeddingHubTab = {
  label: string;
  icon: IconName;
  to: string;
  isGated?: boolean;
  /** The design caps most hub pages at 800px; only a few need the whole
   * area. See `EmbeddingHubContent`. A gated tab is also full width: its
   * upsell page owns the whole tab, header included, same as Permissions. */
  fullWidth?: boolean;
};

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
  const hasSsoJwt = useHasTokenFeature("sso_jwt");
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasTenants = useHasTokenFeature("tenants");
  const hasContentTranslation = useHasTokenFeature("content_translation");

  useEnsureDefaultEmbeddingThemes();

  // Order comes from the design.
  const tabs: EmbeddingHubTab[] = [
    { label: t`Get started`, icon: "list", to: Urls.embeddingHubGetStarted() },
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
    {
      label: t`Permissions`,
      icon: "key",
      to: Urls.embeddingHubPermissions(),
      fullWidth: true,
    },
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
      isGated: !hasContentTranslation,
    },
  ];

  const currentTab = tabs.find((tab) => isTabSelected(tab, pathname));
  // The theme editor needs the whole area for its side-by-side editor/preview
  // panels, unlike the rest of the Appearance tab, which caps at 800px.
  const isThemeEditor = pathname.startsWith(
    `${Urls.embeddingHubAppearance()}/theme/`,
  );

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
      title={t`Embedding hub`}
      testId="embedding-hub-nav"
      isLoading={isLoadingNavbarKey}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      upperNav={upperNav}
      lowerNav={
        <NewEmbedNavButton
          showLabel={isNavbarOpened}
          tabUrl={currentTab?.to ?? Urls.embeddingHubGetStarted()}
        />
      }
    >
      <EmbeddingHubContent
        fullWidth={
          (currentTab?.fullWidth ?? false) ||
          isThemeEditor ||
          (currentTab?.isGated ?? false)
        }
      >
        <Outlet />
      </EmbeddingHubContent>
    </AreaLayout>
  );
}

function isTabSelected(tab: EmbeddingHubTab, pathname: string) {
  return isUnder(pathname, tab.to);
}

// Matches a whole path segment, never a string prefix, so a tab claims its own
// sub-routes without claiming a sibling whose path merely starts the same way.
export function isUnder(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Pinned to the bottom of the nav, per the design. */
function NewEmbedNavButton({
  showLabel,
  tabUrl,
}: {
  showLabel: boolean;
  tabUrl: string;
}) {
  const navigate = useNavigate();

  return (
    <AreaNavButton
      label={t`New embed`}
      icon="add"
      showLabel={showLabel}
      onClick={() => navigate(Urls.embeddingHubNewEmbed(tabUrl))}
    />
  );
}

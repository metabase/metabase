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

function isTabSelected(tab: EmbeddingHubTab, pathname: string) {
  // The Get started tab is the index route, so it only matches exactly —
  // every other path would otherwise match its prefix too.
  return tab.to === Urls.embeddingHub()
    ? pathname === tab.to
    : pathname.startsWith(tab.to);
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
    },
    { label: t`Permissions`, icon: "key", to: Urls.embeddingHubPermissions() },
    { label: t`Tenancy`, icon: "group", to: Urls.embeddingHubTenancy() },
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
      <EmbeddingHubContent>
        <Outlet />
      </EmbeddingHubContent>
    </AreaLayout>
  );
}

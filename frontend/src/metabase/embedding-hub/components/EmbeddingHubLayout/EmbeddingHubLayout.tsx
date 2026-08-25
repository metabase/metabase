import { t } from "ttag";

import { useEnsureDefaultEmbeddingThemes } from "metabase/admin/embedding/hooks";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/current-user";
import {
  AreaLayout,
  AreaNavButton,
  AreaTab,
} from "metabase/nav/components/AreaLayout";
import { useDispatch } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
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
  /** The design caps most hub pages at 800px; only a few need the whole
   * area. See `EmbeddingHubContent`. */
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
  const hasTenants = useHasTokenFeature("tenants");

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
  ];

  const currentTab = tabs.find((tab) => isTabSelected(tab, pathname));

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
      lowerNav={<NewEmbedNavButton showLabel={isNavbarOpened} />}
    >
      <EmbeddingHubContent fullWidth={currentTab?.fullWidth ?? false}>
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

/**
 * Pinned to the bottom of the nav, per the design. It dispatches into the same
 * `id: "embed"` modal the admin button uses, which is why the embedding hub's routes
 * mount inside AppComponent -- NewModals lives there.
 */
function NewEmbedNavButton({ showLabel }: { showLabel: boolean }) {
  const dispatch = useDispatch();

  return (
    <AreaNavButton
      label={t`New embed`}
      icon="add"
      showLabel={showLabel}
      onClick={() =>
        dispatch(
          setOpenModalWithProps({ id: "embed", props: { initialState: {} } }),
        )
      }
    />
  );
}

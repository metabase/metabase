import { t } from "ttag";

import { useEnsureDefaultEmbeddingThemes } from "metabase/admin/embedding/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { AreaLayout, AreaTab } from "metabase/nav/components/AreaLayout";
import { useDispatch } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Outlet, useLocation } from "metabase/router";
import { Button, FixedSizeIcon, Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { EmbeddingHubContent } from "./EmbeddingHubContent";

type EmbeddingHubTab = {
  label: string;
  icon: IconName;
  to: string;
  isGated?: boolean;
};

// Matches a whole path segment, never a string prefix: /embedding/permissions
// is otherwise a prefix of /embedding/permissions-setup, which would strip that
// wizard's padding.
function isUnder(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

// Two things need the whole area: the theme editor, which puts its editor panel
// and live preview side by side, and the permissions editor, which is a
// full-width app of its own. Every other page is capped at 800px, per the
// design. The theme *list* stays capped, so appearance matches only deeper.
function isFullWidthPath(pathname: string) {
  return (
    pathname.startsWith(`${Urls.embeddingHubAppearance()}/`) ||
    isUnder(pathname, Urls.embeddingHubPermissions())
  );
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

  return isUnder(pathname, tab.to);
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

  useEnsureDefaultEmbeddingThemes();

  // Order comes from the design. One tab today; each of the remaining six
  // arrives with its own issue and adds its entry here, gated on the feature
  // it needs.
  const tabs: EmbeddingHubTab[] = [
    { label: t`Get started`, icon: "list", to: Urls.embeddingHub() },
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
      lowerNav={<NewEmbedNavButton />}
    >
      <EmbeddingHubContent fullWidth={isFullWidthPath(pathname)}>
        <Outlet />
      </EmbeddingHubContent>
    </AreaLayout>
  );
}

/**
 * Pinned to the bottom of the nav, per the design. It dispatches into the same
 * `id: "embed"` modal the admin button uses, which is why the hub's routes
 * mount inside AppComponent -- NewModals lives there.
 */
function NewEmbedNavButton() {
  const dispatch = useDispatch();

  return (
    <Button
      variant="subtle"
      leftSection={<FixedSizeIcon name="add" size={12} />}
      fullWidth
      onClick={() =>
        dispatch(
          setOpenModalWithProps({ id: "embed", props: { initialState: {} } }),
        )
      }
    >
      {t`New embed`}
    </Button>
  );
}

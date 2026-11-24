import { KBarPortal, VisualState, useKBar } from "kbar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useOnClickOutside } from "metabase/common/hooks/use-on-click-outside";
import { getUser } from "metabase/current-user";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import { useSelector } from "metabase/redux";
import { useLocation, useParams } from "metabase/router";
import {
  ActionIcon,
  Box,
  Card,
  Center,
  Icon,
  Overlay,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";
import { type SearchQuery, parseSearchQuery } from "metabase/utils/browser";
import { isWithinIframe } from "metabase/utils/iframe";

import { useCommandPalette } from "../hooks/useCommandPalette";
import { useCommandPaletteBasicActions } from "../hooks/useCommandPaletteBasicActions";

import { HydratedKBarSearch } from "./HydratedKBarSearch";
import { PaletteResults } from "./PaletteResults";

// The setup flow runs before there is an instance to search or act on.
const PALETTE_DISABLED_PATHS = ["/setup"];

/** Command palette */
export const Palette = () => {
  const location = useLocation();
  const params = useParams();
  const isLoggedIn = useSelector((state) => !!getUser(state));
  const locationQuery = useMemo(
    () => parseSearchQuery(location.search),
    [location.search],
  );

  const isDisabledForPath = PALETTE_DISABLED_PATHS.some((path) =>
    location.pathname.startsWith(path),
  );

  useCommandPaletteBasicActions({ location, params, isLoggedIn });

  const { query } = useKBar();
  const disabled = isWithinIframe() || !isLoggedIn || isDisabledForPath;
  useEffect(() => {
    query.disable(disabled);
  }, [disabled, query]);

  return (
    <KBarPortal>
      <Overlay backgroundOpacity={0.5}>
        <Center pt="10vh">
          <PaletteContainer disabled={disabled} locationQuery={locationQuery} />
        </Center>
      </Overlay>
    </KBarPortal>
  );
};

export const PaletteContainer = ({
  disabled,
  locationQuery,
}: {
  disabled: boolean;
  locationQuery: SearchQuery;
}) => {
  const { query } = useKBar();
  const ref = useRef<HTMLDivElement>(null);
  const searchText = typeof locationQuery.q === "string" ? locationQuery.q : "";
  // PROTOTYPE: with git integration on, a toggle in the search box limits
  // search to official (git-synced) content, and starts on. Without git
  // there's no toggle, and search covers the usual (non-trashed) everything.
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const [isOfficialOnly, setIsOfficialOnly] = useState(true);
  const isSearchingOfficial = isGitIntegrationEnabled && isOfficialOnly;
  const placeholder = !isGitIntegrationEnabled
    ? t`Search…`
    : isOfficialOnly
      ? t`Search official content…`
      : t`Search for anything…`;

  // Turns the official-only toggle off, then hands focus back to the search
  // box (clicks on the toggle or the no-results button leave it elsewhere).
  const widenSearch = useCallback(() => {
    setIsOfficialOnly(false);
    ref.current?.querySelector("input")?.focus();
  }, []);
  const {
    searchRequestId,
    searchResults,
    liveSearchTerm,
    debouncedSearchTerm,
  } = useCommandPalette({
    locationQuery,
    disabled,
    scope: isSearchingOfficial ? "official" : "all",
    onSearchEverywhere: widenSearch,
  });

  useOnClickOutside(ref, () => {
    query.setVisualState(VisualState.hidden);
  });

  return (
    <Card
      ref={ref}
      w="640px"
      p="0"
      // PROTOTYPE: the same corner radius as the app's modals.
      radius="lg"
      data-testid="command-palette"
      bd="1px solid var(--mb-color-border-neutral)"
    >
      <Stack gap={rem(4)} pb="xl">
        <Box pos="relative">
          <HydratedKBarSearch
            searchText={searchText}
            placeholder={placeholder}
            hasToggle={isGitIntegrationEnabled}
          />
          {isGitIntegrationEnabled && (
            <Box
              pos="absolute"
              // Plain CSS: `right`/`top` don't take theme spacing names.
              style={{
                right: "var(--mantine-spacing-xl)",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              <Tooltip
                label={
                  isOfficialOnly
                    ? t`Search everywhere`
                    : t`Search only official content`
                }
              >
                <ActionIcon
                  variant="subtle"
                  selected={isOfficialOnly}
                  aria-pressed={isOfficialOnly}
                  aria-label={t`Search only official content`}
                  onClick={() => {
                    setIsOfficialOnly(!isOfficialOnly);
                    // Back to typing: the click leaves focus on the button.
                    ref.current?.querySelector("input")?.focus();
                  }}
                >
                  <Icon name="folder_bookmark" />
                </ActionIcon>
              </Tooltip>
            </Box>
          )}
        </Box>

        <PaletteResults
          align="stretch"
          locationQuery={locationQuery}
          searchRequestId={searchRequestId}
          searchResults={searchResults}
          liveSearchTerm={liveSearchTerm}
          debouncedSearchTerm={debouncedSearchTerm}
        />
      </Stack>
    </Card>
  );
};

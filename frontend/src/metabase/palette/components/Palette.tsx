import { KBarPortal, VisualState, useKBar } from "kbar";
import { useEffect, useMemo, useRef } from "react";

import { useOnClickOutside } from "metabase/common/hooks/use-on-click-outside";
import { useSelector } from "metabase/redux";
import { useLocation, useParams } from "metabase/router";
import { getUser } from "metabase/selectors/user";
import { Box, Card, Center, Icon, Overlay, Stack, rem } from "metabase/ui";
import { type SearchQuery, parseSearchQuery } from "metabase/utils/browser";
import { isWithinIframe } from "metabase/utils/iframe";

import { useCommandPalette } from "../hooks/useCommandPalette";
import { useCommandPaletteBasicActions } from "../hooks/useCommandPaletteBasicActions";

import { HydratedKBarSearch } from "./HydratedKBarSearch";
import S from "./Palette.module.css";
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
  const ref = useRef(null);
  const searchText = typeof locationQuery.q === "string" ? locationQuery.q : "";

  const {
    searchRequestId,
    searchResults,
    liveSearchTerm,
    debouncedSearchTerm,
  } = useCommandPalette({
    locationQuery,
    disabled,
  });

  useOnClickOutside(ref, () => {
    query.setVisualState(VisualState.hidden);
  });

  return (
    <Card
      ref={ref}
      w="640px"
      p="0"
      data-testid="command-palette"
      bd="1px solid var(--mb-color-border-neutral)"
    >
      <Stack gap={rem(4)} pb="lg">
        <Box pos="relative">
          <HydratedKBarSearch searchText={searchText} />

          <Stack
            className={S.iconContainer}
            align="center"
            left={36} // align this icon with results icons
            pos="absolute"
            top={26}
          >
            <Icon c="text-primary" name="search" />
          </Stack>
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

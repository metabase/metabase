import type { Query } from "history";
import { KBarPortal, KBarSearch, VisualState, useKBar } from "kbar";
import { useEffect, useRef } from "react";
import { type PlainRoute, withRouter } from "react-router";
import { t } from "ttag";

import { useOnClickOutside } from "metabase/common/hooks/use-on-click-outside";
import { isWithinIframe } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Card, Center, Icon, Overlay, Stack, rem } from "metabase/ui";

import { useCommandPalette } from "../hooks/useCommandPalette";
import { useCommandPaletteBasicActions } from "../hooks/useCommandPaletteBasicActions";

import S from "./Palette.module.css";
import { PaletteResults } from "./PaletteResults";

/** Command palette */
export const Palette = withRouter((props) => {
  const isLoggedIn = useSelector((state) => !!getUser(state));

  const disableCommandPaletteForRoute = props.routes.some(
    (route: PlainRoute & { disableCommandPalette?: boolean }) =>
      route.disableCommandPalette,
  );

  useCommandPaletteBasicActions({ ...props, isLoggedIn });

  const { query } = useKBar();
  const disabled =
    isWithinIframe() || !isLoggedIn || disableCommandPaletteForRoute;
  useEffect(() => {
    query.disable(disabled);
  }, [disabled, query]);

  return (
    <KBarPortal>
      <Overlay backgroundOpacity={0.5}>
        <Center pt="10vh">
          <PaletteContainer
            disabled={disabled}
            locationQuery={props.location.query}
          />
        </Center>
      </Overlay>
    </KBarPortal>
  );
});

export const PaletteContainer = withRouter(
  ({
    disabled,
    locationQuery,
  }: {
    disabled: boolean;
    locationQuery: Query;
  }) => {
    const { query } = useKBar((state) => ({ actions: state.actions }));
    const ref = useRef(null);

    const { searchRequestId, searchResults, searchTerm } = useCommandPalette({
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
        bd="1px solid var(--mb-color-border)"
      >
        <Stack gap={rem(4)} pb="lg">
          <Box pos="relative">
            <KBarSearch
              className={S.input}
              defaultPlaceholder={t`Search for anything…`}
            />

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
            searchTerm={searchTerm}
          />
        </Stack>
      </Card>
    );
  },
);

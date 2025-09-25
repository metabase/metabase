import { KBarPortal, KBarSearch, VisualState, useKBar } from "kbar";
import { type HTMLAttributes, forwardRef, useEffect, useRef } from "react";
import { type PlainRoute, withRouter } from "react-router";
import { t } from "ttag";

import { useOnClickOutside } from "metabase/common/hooks/use-on-click-outside";
import { isWithinIframe } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import {
  Box,
  Card,
  Center,
  Icon,
  Overlay,
  type OverlayProps,
  Stack,
  rem,
} from "metabase/ui";

import { useCommandPalette } from "../hooks/useCommandPalette";
import { useCommandPaletteBasicActions } from "../hooks/useCommandPaletteBasicActions";

import S from "./Palette.module.css";
import { PaletteResults } from "./PaletteResults";

/**
 * Thin wrapper for useCommandPalette.
 * Limits re-render scope and provides an easy way to enable/disable entire hook.
 */
const AdvancedPaletteActions = withRouter((props) => {
  useCommandPalette({ locationQuery: props.location.query });
  return null;
});

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
    <>
      <KBarPortal>
        <PaletteContainer />
      </KBarPortal>
      {!disabled && <AdvancedPaletteActions />}
    </>
  );
});

const PaletteContainer = () => {
  const { query } = useKBar((state) => ({ actions: state.actions }));
  const ref = useRef(null);

  useOnClickOutside(ref, () => {
    query.setVisualState(VisualState.hidden);
  });

  return (
    <PaletteCard ref={ref}>
      <Stack gap={rem(4)} pb="lg">
        <Box pos="relative">
          <KBarSearch
            className={S.input}
            defaultPlaceholder={t`Search for anything…`}
          />

          <Stack
            className={S.iconContainer}
            align="center"
            left="var(--mantine-spacing-xl)"
            pos="absolute"
            bottom={10}
          >
            <Icon c="text-dark" name="search" />
          </Stack>
        </Box>

        <PaletteResults align="stretch" />
      </Stack>
    </PaletteCard>
  );
};

export const PaletteCard = forwardRef<
  HTMLDivElement,
  OverlayProps & HTMLAttributes<HTMLDivElement>
>(function PaletteCard({ children, ...props }, ref) {
  return (
    <Overlay zIndex={500} backgroundOpacity={0.5} {...props}>
      <Center>
        <Card ref={ref} w="640px" mt="10vh" p="0" data-testid="command-palette">
          {children}
        </Card>
      </Center>
    </Overlay>
  );
});

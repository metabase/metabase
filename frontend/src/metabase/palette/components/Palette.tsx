import { KBarPortal, VisualState, useKBar } from "kbar";
import { type HTMLAttributes, forwardRef, useEffect, useRef } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";

import { useOnClickOutside } from "metabase/hooks/use-on-click-outside";
import { isWithinIframe } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Card, Center, Overlay, type OverlayProps } from "metabase/ui";

import { useCommandPaletteBasicActions } from "../hooks/useCommandPaletteBasicActions";

import { PaletteInput } from "./Palette.styled";
import { PaletteFooter } from "./PaletteFooter";
import { PaletteResults } from "./PaletteResults";

/** Command palette */
export const Palette = withRouter(props => {
  const isLoggedIn = useSelector(state => !!getUser(state));

  useCommandPaletteBasicActions({ ...props, isLoggedIn });

  //Disable when iframed in
  const { query } = useKBar();
  useEffect(() => {
    query.disable(isWithinIframe() || !isLoggedIn);
  }, [isLoggedIn, query]);

  return (
    <KBarPortal>
      <PaletteContainer />
    </KBarPortal>
  );
});

const PaletteContainer = () => {
  const { query } = useKBar(state => ({ actions: state.actions }));
  const ref = useRef(null);

  useOnClickOutside(ref, () => {
    query.setVisualState(VisualState.hidden);
  });

  return (
    <PaletteCard ref={ref}>
      <Box w="100%" p="1.5rem" pb="0">
        <PaletteInput
          defaultPlaceholder={t`Search for anything or jump somewhere…`}
        />
      </Box>
      <PaletteResults />
      <PaletteFooter />
    </PaletteCard>
  );
};

export const PaletteCard = forwardRef<
  HTMLDivElement,
  OverlayProps & HTMLAttributes<HTMLDivElement>
>(function PaletteCard({ children, ...props }, ref) {
  return (
    <Overlay opacity={0.5} {...props}>
      <Center>
        <Card ref={ref} w="640px" mt="10vh" p="0" data-testid="command-palette">
          {children}
        </Card>
      </Center>
    </Overlay>
  );
});

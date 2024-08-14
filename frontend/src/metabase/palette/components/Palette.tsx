import { KBarPortal, VisualState, useKBar } from "kbar";
import { useRef, useEffect } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { useOnClickOutside } from "metabase/hooks/use-on-click-outside";
import { isWithinIframe } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Card, Center, Overlay } from "metabase/ui";

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
    <Overlay opacity={0.5}>
      <Center>
        <Card
          ref={ref}
          w="640px"
          mt="10vh"
          p="0"
          style={{
            zIndex: 100,
          }}
          data-testid="command-palette"
        >
          <Box w="100%" p="1.5rem" pb="0">
            <PaletteInput
              defaultPlaceholder={t`Search for anything or jump somewhere…`}
            />
          </Box>
          <PaletteResults />
          <PaletteFooter />
        </Card>
      </Center>
    </Overlay>
  );
};

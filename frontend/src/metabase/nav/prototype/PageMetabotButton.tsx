import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { MetabotAppBarButton } from "metabase/metabot/components/MetabotAppBarButton";
import { useIsFullPageMetabot } from "metabase/metabot/hooks";
import { Box } from "metabase/ui";

/*
 * PROTOTYPE: in the "No top nav" variant, "Chat with Metabot" moves from the
 * app bar into each main-app page's header: left of the page's "…" menu, or
 * after its other top-right actions. Pages that don't place it get it in the
 * top-right corner instead.
 */

type PageMetabotButtonContextValue = {
  isEnabled: boolean;
  /** Registers a page-placed button; returns the cleanup. */
  claim: () => () => void;
  claimCount: number;
};

const PageMetabotButtonContext = createContext<PageMetabotButtonContextValue>({
  isEnabled: false,
  claim: () => () => {},
  claimCount: 0,
});

export function PageMetabotButtonProvider({
  isEnabled,
  children,
}: {
  isEnabled: boolean;
  children: ReactNode;
}) {
  const [claimCount, setClaimCount] = useState(0);
  const claim = useCallback(() => {
    setClaimCount((count) => count + 1);
    return () => setClaimCount((count) => count - 1);
  }, []);
  const value = useMemo(
    () => ({ isEnabled, claim, claimCount }),
    [isEnabled, claim, claimCount],
  );

  return (
    <PageMetabotButtonContext.Provider value={value}>
      {children}
    </PageMetabotButtonContext.Provider>
  );
}

function useIsPageMetabotButtonVisible() {
  const { isEnabled } = useContext(PageMetabotButtonContext);
  // The full-page Metabot (Ask, conversations) has no side chat to open.
  const isFullPageMetabot = useIsFullPageMetabot();
  return isEnabled && !isFullPageMetabot;
}

/** Placed in a page header, where the page wants "Chat with Metabot". */
export function PageMetabotButton() {
  const { claim } = useContext(PageMetabotButtonContext);
  const isVisible = useIsPageMetabotButtonVisible();

  // Before paint, so the corner fallback doesn't flash on pages that place it.
  useLayoutEffect(() => (isVisible ? claim() : undefined), [isVisible, claim]);

  return isVisible ? <MetabotAppBarButton variant="subtle" /> : null;
}

/** The top-right corner fallback, for pages that don't place the button. */
export function PageMetabotButtonFallback() {
  const { claimCount } = useContext(PageMetabotButtonContext);
  const isVisible = useIsPageMetabotButtonVisible();

  if (!isVisible || claimCount > 0) {
    return null;
  }

  return (
    <Box pos="absolute" top="lg" right="lg" style={{ zIndex: 2 }}>
      <MetabotAppBarButton variant="subtle" />
    </Box>
  );
}

import { useEffect } from "react";
import { useLocation, usePrevious } from "react-use";

import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const METABOT_AUTO_CLOSE_DURATION_MS = 30 * 1000;

export function useAutoCloseMetabot(hasUserInput: boolean) {
  const { visible, setVisible, isDoingScience } = useMetabotAgent();

  const location = useLocation();
  const { pathname } = location;
  const prevPathname = usePrevious(pathname);

  const isUiClosable = visible && !isDoingScience && !hasUserInput;
  const isRouteChange =
    pathname !== undefined &&
    prevPathname !== undefined &&
    pathname !== prevPathname;

  // auto-close metabot on route change, unless:
  // - route change happened during metabot processing
  // - user has some kind of value in the input
  useEffect(() => {
    if (isUiClosable && isRouteChange) {
      setVisible(false);
    }
  }, [isUiClosable, isRouteChange, setVisible]);

  // auto-close based when inactive for too long
  const isInactive = !hasUserInput && !isDoingScience;

  useEffect(() => {
    if (isInactive) {
      const timer = setTimeout(
        () => setVisible(false),
        METABOT_AUTO_CLOSE_DURATION_MS,
      );
      return () => clearTimeout(timer);
    }
  }, [isInactive, setVisible]);
}

import { useEffect } from "react";
import { useLocation, usePrevious } from "react-use";

import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const METABOT_AUTO_CLOSE_DURATION_MS = 30 * 1000;

function basePathSegment(pathname: string) {
  return pathname.split("/")?.[1] ?? "";
}

export function useAutoCloseMetabot(hasUserInput: boolean) {
  const { visible, setVisible, isDoingScience } = useMetabotAgent();

  const location = useLocation();
  const { pathname } = location;
  const prevPathname = usePrevious(pathname);

  const isUiClosable = visible && !isDoingScience && !hasUserInput;
  const isClosableRouteChange =
    pathname !== undefined &&
    prevPathname !== undefined &&
    basePathSegment(pathname) !== basePathSegment(prevPathname);

  // auto-close metabot on route change, unless:
  // - route change happened during metabot processing
  // - base segment of the route is the same (prevent hide if /question/1 => /question#ad-hoc-query-has)
  // - user has some kind of value in the input
  useEffect(() => {
    if (isUiClosable && isClosableRouteChange) {
      setVisible(false);
    }
  }, [isUiClosable, isClosableRouteChange, setVisible]);

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

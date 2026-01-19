import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useCompatLocation } from "metabase/routing/compat";

interface ScrollToTopProps {
  children: ReactNode;
}

/**
 * Component that scrolls to the top of the page when the pathname changes.
 *
 * This replaces the class-based withRouter HOC implementation with a
 * hook-based approach that works with both React Router v3 and v7.
 */
function ScrollToTop({ children }: ScrollToTopProps) {
  const location = useCompatLocation();
  const prevPathname = useRef(location.pathname);

  useEffect(() => {
    // Compare location.pathname to see if we're on a different URL.
    // Do this to ensure that query strings don't cause a scroll to the top
    if (location.pathname !== prevPathname.current) {
      window.scrollTo(0, 0);
      prevPathname.current = location.pathname;
    }
  }, [location.pathname]);

  return <>{children}</>;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScrollToTop;

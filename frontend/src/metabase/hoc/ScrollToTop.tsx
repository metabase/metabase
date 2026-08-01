import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useLocation, useNavigationType } from "metabase/router";

interface ScrollToTopProps {
  children?: ReactNode;
}

function ScrollToTop({ children }: ScrollToTopProps) {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    // Compare pathname so query strings don't cause a scroll to the top.
    if (pathname !== previousPathname.current) {
      previousPathname.current = pathname;

      // Browser back/forward navigation should preserve the native scroll position.
      if (navigationType !== "POP") {
        window.scrollTo(0, 0);
      }
    }
  }, [pathname, navigationType]);

  return <>{children}</>;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScrollToTop;

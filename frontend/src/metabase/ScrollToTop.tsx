import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useLocation } from "metabase/router";

interface ScrollToTopProps {
  children?: ReactNode;
}

function ScrollToTop({ children }: ScrollToTopProps) {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    // Compare pathname so query strings don't cause a scroll to the top.
    if (pathname !== previousPathname.current) {
      previousPathname.current = pathname;
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return <>{children}</>;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScrollToTop;

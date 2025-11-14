import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";

export type TransformsNavTab = "transforms" | "jobs" | "runs";

export function useTransformsCurrentTab(): TransformsNavTab {
  const { pathname } = useSelector(getLocation);

  return useMemo(() => {
    if (pathname.startsWith(Urls.transformJobList())) {
      return "jobs";
    }
    if (pathname.startsWith(Urls.transformRunList())) {
      return "runs";
    }
    return "transforms";
  }, [pathname]);
}

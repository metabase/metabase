import { useMemo } from "react";

import {
  type BenchNavItem,
  findNavItemByPath,
  getBenchNavItems,
} from "metabase/bench/constants/navigation";
import { usePath } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

export function useBenchCurrentTab(): BenchNavItem {
  const pathname = usePath();
  const isAdmin = useSelector(getUserIsAdmin);

  return useMemo(() => {
    const item = pathname ? findNavItemByPath(pathname, isAdmin) : null;
    return item ?? getBenchNavItems(isAdmin)[0];
  }, [isAdmin, pathname]);
}

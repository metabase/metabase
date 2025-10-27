import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api/database";
import {
  type BenchNavItem,
  findNavItemByPath,
  getBenchNavItems,
} from "metabase/bench/constants/navigation";
import { usePath } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getHasNativeWrite } from "metabase/selectors/data";
import { getUserIsAdmin } from "metabase/selectors/user";

export function useBenchCurrentTab(): BenchNavItem {
  const pathname = usePath();
  const isAdmin = useSelector(getUserIsAdmin);
  const { data } = useListDatabasesQuery();
  const hasNativeWrite = getHasNativeWrite(data?.data ?? []);

  return useMemo(() => {
    const item = pathname
      ? findNavItemByPath(pathname, isAdmin, hasNativeWrite)
      : null;
    return item ?? getBenchNavItems(isAdmin, true)[0];
  }, [hasNativeWrite, isAdmin, pathname]);
}

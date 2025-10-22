import { useMemo } from "react";

import {
  BENCH_NAV_ITEMS,
  type BenchNavItem,
  findNavItemByPath,
} from "metabase/bench/constants/navigation";
import { usePath } from "metabase/common/hooks";

export function useBenchCurrentTab(): BenchNavItem {
  const pathname = usePath();

  return useMemo(() => {
    const item = pathname ? findNavItemByPath(pathname) : null;
    return item ?? BENCH_NAV_ITEMS[0];
  }, [pathname]);
}

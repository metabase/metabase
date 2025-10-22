import { useMemo } from "react";
import { t } from "ttag";

import { usePath } from "metabase/common/hooks";

export interface BenchTab {
  id: string;
  label: string;
  icon: string;
}

export const BENCH_TABS: BenchTab[] = [
  { id: "overview", label: t`Overview`, icon: "home" },
  { id: "transforms", label: t`Transforms`, icon: "sql" },
  { id: "model", label: t`Models`, icon: "model" },
  { id: "metric", label: t`Metrics`, icon: "metric" },
  { id: "segment", label: t`Segments`, icon: "filter" },
  { id: "snippet", label: t`SQL snippets`, icon: "snippet" },
  { id: "metadata", label: t`Metadata`, icon: "database" },
  { id: "dependencies", label: t`Dependencies`, icon: "beaker" },
  { id: "glossary", label: t`Glossary`, icon: "globe" },
];

export function useBenchCurrentTab(): BenchTab {
  const pathname = usePath();

  return useMemo(() => {
    if (!pathname) {
      return BENCH_TABS[0];
    }

    const pathParts = pathname.split("/").filter(Boolean);
    const benchIndex = pathParts.indexOf("bench");

    if (benchIndex === -1 || benchIndex === pathParts.length - 1) {
      return BENCH_TABS[0];
    }

    let currentPath = pathParts[benchIndex + 1];

    if (currentPath === "jobs" || currentPath === "runs") {
      currentPath = "transforms";
    }

    const matchingTab = BENCH_TABS.find(tab => tab.id === currentPath);

    return matchingTab || BENCH_TABS[0];
  }, [pathname]);
}

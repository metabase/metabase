import { useMemo } from "react";
import { t } from "ttag";

import { usePath } from "metabase/common/hooks";
import type { IconName } from "metabase/ui";

export interface BenchTab {
  id: string;
  label: string;
  icon: IconName;
}

export const BENCH_TABS: BenchTab[] = [
  {
    id: "overview",
    get label() {
      return t`Overview`;
    },
    icon: "home",
  },
  {
    id: "transforms",
    get label() {
      return t`Transforms`;
    },
    icon: "sql",
  },
  {
    id: "model",
    get label() {
      return t`Models`;
    },
    icon: "model",
  },
  {
    id: "metric",
    get label() {
      return t`Metrics`;
    },
    icon: "metric",
  },
  {
    id: "segment",
    get label() {
      return t`Segments`;
    },
    icon: "filter",
  },
  {
    id: "snippet",
    get label() {
      return t`SQL snippets`;
    },
    icon: "snippet",
  },
  {
    id: "metadata",
    get label() {
      return t`Metadata`;
    },
    icon: "database",
  },
  {
    id: "dependencies",
    get label() {
      return t`Dependencies`;
    },
    icon: "beaker",
  },
  {
    id: "glossary",
    get label() {
      return t`Glossary`;
    },
    icon: "globe",
  },
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

    const matchingTab = BENCH_TABS.find((tab) => tab.id === currentPath);

    return matchingTab || BENCH_TABS[0];
  }, [pathname]);
}

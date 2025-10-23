import { t } from "ttag";

import type { IconName } from "metabase/ui";

export interface BenchNavItem {
  id: string;
  url: string;
  icon: IconName;
  getLabel: () => string;
  parentId?: string;
  nested?: boolean;
}

export interface BenchNavSection {
  id: string;
  getTitle: () => string;
  items: BenchNavItem[];
}

const OVERVIEW_ITEM: BenchNavItem = {
  id: "overview",
  url: "/bench/overview",
  icon: "home",
  getLabel: () => t`Overview`,
};

export const BENCH_NAV_SECTIONS: BenchNavSection[] = [
  {
    id: "data",
    getTitle: () => t`Data`,
    items: [
      {
        id: "metadata",
        url: "/bench/metadata",
        icon: "database",
        getLabel: () => t`Metadata`,
      },
      {
        id: "transforms",
        url: "/bench/transforms",
        icon: "transform",
        getLabel: () => t`Transforms`,
      },
      {
        id: "jobs",
        url: "/bench/jobs",
        icon: "play_outlined",
        getLabel: () => t`Jobs`,
        parentId: "transforms",
        nested: true,
      },
      {
        id: "runs",
        url: "/bench/runs",
        icon: "list",
        getLabel: () => t`Runs`,
        parentId: "transforms",
        nested: true,
      },
    ],
  },
  {
    id: "modeling",
    getTitle: () => t`Modeling`,
    items: [
      {
        id: "metric",
        url: "/bench/metric",
        icon: "metric",
        getLabel: () => t`Metrics`,
      },
      {
        id: "model",
        url: "/bench/model",
        icon: "model",
        getLabel: () => t`Models`,
      },
      {
        id: "segment",
        url: "/bench/segment",
        icon: "segment",
        getLabel: () => t`Segments`,
      },
      {
        id: "glossary",
        url: "/bench/glossary",
        icon: "globe",
        getLabel: () => t`Glossary`,
      },
    ],
  },
  {
    id: "tools",
    getTitle: () => t`Tools`,
    items: [
      {
        id: "dependency-graph",
        url: "/bench/dependencies",
        icon: "network",
        getLabel: () => t`Dependency graph`,
      },
      {
        id: "snippet",
        url: "/bench/snippet",
        icon: "snippet",
        getLabel: () => t`SQL snippets`,
      },
      {
        id: "library",
        url: "/bench/library/common.py",
        icon: "code_block",
        getLabel: () => t`Python Library`,
      },
    ],
  },
];

export const BENCH_NAV_ITEMS: BenchNavItem[] = [
  OVERVIEW_ITEM,
  ...BENCH_NAV_SECTIONS.flatMap((section) => section.items),
];

export function findNavItemByPath(pathname: string): BenchNavItem | null {
  if (!pathname) {
    return null;
  }

  const pathParts = pathname.split("/").filter(Boolean);
  const benchIndex = pathParts.indexOf("bench");

  if (benchIndex === -1 || benchIndex === pathParts.length - 1) {
    return null;
  }

  const pathSegment = pathParts[benchIndex + 1];

  return BENCH_NAV_ITEMS.find((item) => item.id === pathSegment) ?? null;
}

export { OVERVIEW_ITEM };

import { t } from "ttag";

import { PLUGIN_TRANSFORMS, PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
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

export const getBenchNavSections = (isAdmin: boolean): BenchNavSection[] => {
  const navSections: BenchNavSection[] = [
    {
      id: "data",
      getTitle: () => t`Data`,
      items: [
        ...(isAdmin
          ? [
              {
                id: "metadata",
                url: "/bench/metadata",
                icon: "database",
                getLabel: () => t`Metadata`,
              } as BenchNavItem,
            ]
          : []),
        ...PLUGIN_TRANSFORMS.getTransformNavItems(isAdmin),
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
        ...PLUGIN_TRANSFORMS_PYTHON.getTransformNavItems(isAdmin),
      ],
    },
  ];

  return navSections.filter((section) => section.items.length > 0);
};

export const getBenchNavItems = (isAdmin: boolean): BenchNavItem[] => {
  return [
    OVERVIEW_ITEM,
    ...getBenchNavSections(isAdmin).flatMap((section) => section.items),
  ];
};

export function findNavItemByPath(
  pathname: string,
  isAdmin: boolean,
): BenchNavItem | null {
  if (!pathname) {
    return null;
  }

  const pathParts = pathname.split("/").filter(Boolean);
  const benchIndex = pathParts.indexOf("bench");

  if (benchIndex === -1 || benchIndex === pathParts.length - 1) {
    return null;
  }

  const pathSegment = pathParts[benchIndex + 1];

  return (
    getBenchNavItems(isAdmin).find((item) => item.id === pathSegment) ?? null
  );
}

export { OVERVIEW_ITEM };

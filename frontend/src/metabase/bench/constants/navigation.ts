import { t } from "ttag";

import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import type { IconName } from "metabase/ui";

export interface BenchNavItem {
  id: string;
  url: string;
  icon: IconName;
  getLabel: () => string;
  getDescription?: () => string;
  parentId?: string;
  nested?: boolean;
}

export interface BenchNavSection {
  id: string;
  getTitle: () => string;
  getLongTitle: () => string;
  items: BenchNavItem[];
}

const OVERVIEW_ITEM: BenchNavItem = {
  id: "overview",
  url: "/bench/overview",
  icon: "home",
  getLabel: () => t`Overview`,
  getDescription: () => "",
};

export const getBenchNavSections = (
  isAdmin: boolean,
  hasNativeWrite: boolean,
): BenchNavSection[] => {
  const navSections: BenchNavSection[] = [
    {
      id: "data",
      getTitle: () => t`Data`,
      getLongTitle: () => t`Clean up your schema`,
      items: [
        ...(isAdmin
          ? [
              {
                id: "metadata",
                url: "/bench/metadata",
                icon: "database",
                getLabel: () => t`Metadata`,
                getDescription: () =>
                  t`Hide irrelevant tables, and format, describe, and add semantic types to columns.`,
              } as BenchNavItem,
            ]
          : []),
        ...PLUGIN_TRANSFORMS.getBenchNavItems(isAdmin),
      ],
    },
    {
      id: "modeling",
      getTitle: () => t`Modeling`,
      getLongTitle: () => t`Model your data`,
      items: [
        {
          id: "metric",
          url: "/bench/metric",
          icon: "metric",
          getLabel: () => t`Metrics`,
          getDescription: () =>
            t`Codify the KPIs and measures your organization keeps tabs on.`,
        },
        {
          id: "model",
          url: "/bench/model",
          icon: "model",
          getLabel: () => t`Models`,
          getDescription: () =>
            t`Decorate your favorite tables and organize them into collections.`,
        },
        {
          id: "segment",
          url: "/bench/segment",
          icon: "segment",
          getLabel: () => t`Segments`,
          getDescription: () =>
            t`Define named subsets of tables that you can use as filters.`,
        },
        {
          id: "glossary",
          url: "/bench/glossary",
          icon: "globe",
          getLabel: () => t`Glossary`,
          getDescription: () =>
            t`Define terms to help your team understand your data.`,
        },
      ],
    },
    {
      id: "tools",
      getTitle: () => t`Tools`,
      getLongTitle: () => t`Keep things running smoothly`,
      items: [
        ...PLUGIN_DEPENDENCIES.getBenchNavItems(),
        ...(hasNativeWrite
          ? [
              {
                id: "snippet",
                url: "/bench/snippet",
                icon: "snippet" as const,
                getLabel: () => t`SQL snippets`,
                getDescription: () =>
                  t`Define reusable bits of SQL for your whole team to use in your queries.`,
              },
            ]
          : []),
        ...PLUGIN_TRANSFORMS_PYTHON.getBenchNavItems(isAdmin),
      ],
    },
  ];

  return navSections.filter((section) => section.items.length > 0);
};

export const getBenchNavItems = (
  isAdmin: boolean,
  hasNativeWrite: boolean,
): BenchNavItem[] => {
  return [
    OVERVIEW_ITEM,
    ...getBenchNavSections(isAdmin, hasNativeWrite).flatMap(
      (section) => section.items,
    ),
  ];
};

export function findNavItemByPath(
  pathname: string,
  isAdmin: boolean,
  hasNativeWrite: boolean,
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
    getBenchNavItems(isAdmin, hasNativeWrite).find(
      (item) => item.id === pathSegment,
    ) ?? null
  );
}

export { OVERVIEW_ITEM };

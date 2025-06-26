import { t } from "ttag";

import type { AdminPath } from "metabase-types/store";

import { PerformanceTabId } from "../types";

export const getPerformanceTabMetadata = () =>
  [
    {
      name: t`Database caching`,
      path: "/admin/performance/databases",
      key: "performance-databases",
      tabId: PerformanceTabId.Databases,
    },
    {
      name: t`Model persistence`,
      path: "/admin/performance/models",
      key: "performance-models",
      tabId: PerformanceTabId.Models,
    },
  ] as (AdminPath & { tabId: string })[];

export const getPerformanceAdminPaths = (metadata: AdminPath[]) =>
  metadata.map((tab) => ({ ...tab, name: `${t`Performance`} - ${tab.name}` }));

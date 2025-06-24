import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { PLUGIN_CACHING } from "metabase/plugins";

import { PerformanceTabId } from "../types";
import { getPerformanceTabName } from "../utils";

export const PerformanceApp = ({ children }: { children: React.ReactNode }) => (
  <AdminSettingsLayout
    maw="60rem"
    sidebar={
      <AdminNavWrapper>
        <AdminNavItem
          label={getPerformanceTabName(PerformanceTabId.Databases)}
          path="/admin/performance/databases"
          icon="database"
        />
        {PLUGIN_CACHING.isGranularCachingEnabled() && (
          <AdminNavItem
            label={getPerformanceTabName(
              PerformanceTabId.DashboardsAndQuestions,
            )}
            path="/admin/performance/dashboards-and-questions"
            icon="dashboard"
          />
        )}
        <AdminNavItem
          label={getPerformanceTabName(PerformanceTabId.Models)}
          path="/admin/performance/models"
          icon="model"
        />
      </AdminNavWrapper>
    }
  >
    {children}
  </AdminSettingsLayout>
);

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/settings/components/AdminNav";
import { AdminSettingsLayout } from "metabase/components/AdminLayout/AdminSettingsLayout";
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
        <AdminNavItem
          label={getPerformanceTabName(PerformanceTabId.DashboardsAndQuestions)}
          path="/admin/performance/dashboards-and-questions"
          icon="dashboard"
        />
        {PLUGIN_CACHING && (
          <AdminNavItem
            label={getPerformanceTabName(PerformanceTabId.Models)}
            path="/admin/performance/models"
            icon="model"
          />
        )}
      </AdminNavWrapper>
    }
  >
    {children}
  </AdminSettingsLayout>
);

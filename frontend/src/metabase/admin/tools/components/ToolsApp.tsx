import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/settings/components/AdminNav";
import { AdminSettingsLayout } from "metabase/components/AdminLayout/AdminSettingsLayout";

export function ToolsApp({ children }: { children: React.ReactNode }) {
  {
    return (
      <AdminSettingsLayout
        maw="100rem"
        sidebar={
          <AdminNavWrapper>
            <AdminNavItem
              label={t`Help`}
              path="/admin/tools/help"
              icon="info_filled"
            />
            <AdminNavItem
              label={t`Tasks`}
              path="/admin/tools/tasks"
              icon="clipboard"
            />
            <AdminNavItem
              label={t`Jobs`}
              path="/admin/tools/jobs"
              icon="clock"
            />
            <AdminNavItem
              label={t`Logs`}
              path="/admin/tools/logs"
              icon="audit"
            />
            <AdminNavItem
              label={t`Erroring questions`}
              path="/admin/tools/errors"
              icon="warning_round_filled"
            />
            <AdminNavItem
              label={t`Model cache log`}
              path="/admin/tools/model-caching"
              icon="database"
            />
          </AdminNavWrapper>
        }
      >
        {children}
      </AdminSettingsLayout>
    );
  }
}

import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";

export function ToolsApp({ children }: { children: React.ReactNode }) {
  {
    return (
      <AdminSettingsLayout
        maw="100rem"
        sidebar={
          <AdminNavWrapper>
            <ToolsNavItem
              label={t`Help`}
              path="/admin/tools/help"
              icon="info"
            />
            <ToolsNavItem
              label={t`Tasks`}
              path="/admin/tools/tasks"
              icon="clipboard"
            />
            <ToolsNavItem
              label={t`Jobs`}
              path="/admin/tools/jobs"
              icon="clock"
            />
            <ToolsNavItem
              label={t`Logs`}
              path="/admin/tools/logs"
              icon="audit"
            />
            <ToolsNavItem
              label={t`Erroring questions`}
              path="/admin/tools/errors"
              icon="warning_round_filled"
            />
            <ToolsNavItem
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

const ToolsNavItem = (props: AdminNavItemProps) => {
  const location = useSelector(getLocation);
  const subpath = location?.pathname;

  // we want to highlight the nav item even if a subpath is active
  const isActive = !!props.path && subpath.includes(props.path);

  return <AdminNavItem {...props} active={isActive} />;
};

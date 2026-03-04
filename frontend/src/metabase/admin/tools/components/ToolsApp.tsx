import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import * as Urls from "metabase/lib/urls";

type ToolsAppProps = {
  location: Location;
  children?: ReactNode;
};

export function ToolsApp({ location, children }: ToolsAppProps) {
  return (
    <AdminSettingsLayout
      maw="100rem"
      fullWidth={location?.pathname === Urls.dependencyGraph()}
      sidebar={
        <AdminNavWrapper>
          <ToolsNavItem
            label={t`Help`}
            path={Urls.adminToolsHelp()}
            icon="info"
            location={location}
          />
          <ToolsNavItem
            label={t`Tasks`}
            path={Urls.adminToolsTasksBase()}
            icon="clipboard"
            location={location}
          />
          <ToolsNavItem
            label={t`Jobs`}
            path={Urls.adminToolsJobs()}
            icon="clock"
            location={location}
          />
          <ToolsNavItem
            label={t`Logs`}
            path={Urls.adminToolsLogs()}
            icon="audit"
            location={location}
          />
          <ToolsNavItem
            label={t`Erroring questions`}
            path={Urls.adminToolsErrors()}
            icon="warning_round_filled"
            location={location}
          />
          <ToolsNavItem
            label={t`Model cache log`}
            path={Urls.adminToolsModelCaching()}
            icon="database"
            location={location}
          />
        </AdminNavWrapper>
      }
    >
      {children}
    </AdminSettingsLayout>
  );
}

type ToolsNavItemProps = AdminNavItemProps & {
  location: Location;
};

const ToolsNavItem = ({ location, ...props }: ToolsNavItemProps) => {
  // we want to highlight the nav item even if a subpath is active
  const subpath = location?.pathname;
  const isActive = !!props.path && subpath.includes(props.path);

  return <AdminNavItem {...props} active={isActive} />;
};

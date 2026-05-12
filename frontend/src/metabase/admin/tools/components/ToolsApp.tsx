import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { PLUGIN_INTROSPECTOR } from "metabase/plugins";
import * as Urls from "metabase/urls";

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
          {PLUGIN_INTROSPECTOR.isEnabled && (
            <ToolsNavItem
              label={t`Introspector — Content`}
              path={Urls.adminToolsIntrospector()}
              icon="search"
              location={location}
              exact
            />
          )}
          {PLUGIN_INTROSPECTOR.isEnabled && (
            <ToolsNavItem
              label={t`Introspector — Workload`}
              path={Urls.adminToolsIntrospectorWorkload()}
              icon="clock"
              location={location}
            />
          )}
        </AdminNavWrapper>
      }
    >
      {children}
    </AdminSettingsLayout>
  );
}

type ToolsNavItemProps = AdminNavItemProps & {
  location: Location;
  exact?: boolean;
};

const ToolsNavItem = ({ location, exact, ...props }: ToolsNavItemProps) => {
  // we want to highlight the nav item even if a subpath is active,
  // unless `exact` is set — in which case only the exact path counts
  // (used when two items share a prefix, e.g. `introspector` and
  // `introspector/workload`).
  const subpath = location?.pathname ?? "";
  const isActive =
    !!props.path &&
    (exact ? subpath === props.path : subpath.includes(props.path));

  return <AdminNavItem {...props} active={isActive} />;
};

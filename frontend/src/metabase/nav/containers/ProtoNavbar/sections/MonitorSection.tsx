import type { Location } from "history";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

// Usage Analytics + the /admin/tools views (minus Help).
export function MonitorSection({ location }: Props) {
  const path = location.pathname;

  const { data: collections = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });
  const usageAnalytics = collections.find(
    (collection) => collection.type === "instance-analytics",
  );

  return (
    <>
      <SubNavSection>
        <SubNavHeading>{t`Usage analytics`}</SubNavHeading>
        <SidebarLink
          icon="audit"
          url={usageAnalytics ? Urls.collection(usageAnalytics) : "#"}
        >
          {t`Usage analytics`}
        </SidebarLink>
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`Dependencies`}</SubNavHeading>
        <SidebarLink
          icon="dependencies"
          url={Urls.dependencyGraph()}
          isSelected={path.startsWith("/data-studio/dependencies")}
        >
          {t`Dependency graph`}
        </SidebarLink>
        <SidebarLink
          icon="search_check"
          url={Urls.dependencyDiagnostics()}
          isSelected={path.startsWith("/data-studio/dependency-diagnostics")}
        >
          {t`Dependency diagnostics`}
        </SidebarLink>
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`Tools`}</SubNavHeading>
        <SidebarLink
          icon="clipboard"
          url={Urls.adminToolsTasks()}
          isSelected={path.startsWith("/admin/tools/tasks")}
        >
          {t`Tasks`}
        </SidebarLink>
        <SidebarLink
          icon="clock"
          url={Urls.adminToolsJobs()}
          isSelected={path.startsWith("/admin/tools/jobs")}
        >
          {t`Jobs`}
        </SidebarLink>
        <SidebarLink
          icon="audit"
          url={Urls.adminToolsLogs()}
          isSelected={path.startsWith("/admin/tools/logs")}
        >
          {t`Logs`}
        </SidebarLink>
        <SidebarLink
          icon="warning_round_filled"
          url={Urls.adminToolsErrors()}
          isSelected={path.startsWith("/admin/tools/errors")}
        >
          {t`Erroring questions`}
        </SidebarLink>
        <SidebarLink
          icon="database"
          url={Urls.adminToolsModelCaching()}
          isSelected={path.startsWith("/admin/tools/model-caching")}
        >
          {t`Model cache log`}
        </SidebarLink>
        <SidebarLink
          icon="bell"
          url={Urls.adminToolsNotifications()}
          isSelected={path.startsWith("/admin/tools/notifications")}
        >
          {t`Alerts management`}
        </SidebarLink>
      </SubNavSection>
    </>
  );
}

import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

// Usage Analytics + the /monitor views.
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
          isSelected={path.startsWith(Urls.dependencyDiagnostics())}
        >
          {t`Dependency diagnostics`}
        </SidebarLink>
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`Tools`}</SubNavHeading>
        <SidebarLink
          icon="clipboard"
          url={Urls.monitorTasks()}
          isSelected={path.startsWith(Urls.monitorTasks())}
        >
          {t`Tasks`}
        </SidebarLink>
        <SidebarLink
          icon="clock"
          url={Urls.monitorJobs()}
          isSelected={path.startsWith(Urls.monitorJobs())}
        >
          {t`Jobs`}
        </SidebarLink>
        <SidebarLink
          icon="audit"
          url={Urls.monitorLogs()}
          isSelected={path.startsWith(Urls.monitorLogs())}
        >
          {t`Logs`}
        </SidebarLink>
        <SidebarLink
          icon="octagon_alert"
          url={Urls.monitorErroringQuestions()}
          isSelected={path.startsWith(Urls.monitorErroringQuestions())}
        >
          {t`Erroring questions`}
        </SidebarLink>
        <SidebarLink
          icon="database"
          url={Urls.monitorModelPersistenceLog()}
          isSelected={path.startsWith(Urls.monitorModelPersistenceLog())}
        >
          {t`Model cache log`}
        </SidebarLink>
        <SidebarLink
          icon="bell"
          url={Urls.monitorNotifications()}
          isSelected={path.startsWith(Urls.monitorNotifications())}
        >
          {t`Alerts management`}
        </SidebarLink>
      </SubNavSection>
    </>
  );
}

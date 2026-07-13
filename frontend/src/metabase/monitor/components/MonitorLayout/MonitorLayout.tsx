import type { ReactNode } from "react";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import {
  canAccessAlertsManagement,
  canAccessMonitorDiagnostics,
  canAccessMonitoringTools,
} from "metabase/common/monitor/selectors";
import { AreaLayout, AreaTab } from "metabase/nav/components/AreaLayout";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { FixedSizeIcon } from "metabase/ui";
import * as Urls from "metabase/urls";

import { MonitorContent } from "./MonitorContent";

type MonitorLayoutProps = {
  children?: ReactNode;
};

export function MonitorLayout({ children }: MonitorLayoutProps) {
  const {
    value: _isNavbarOpened,
    setValue: setIsNavbarOpened,
    isLoading: isLoadingNavbarKey,
  } = useUserKeyValue({
    namespace: "monitor",
    key: "isNavbarOpened",
  });
  const isNavbarOpened = _isNavbarOpened !== false;

  const { pathname } = useSelector(getLocation);
  const hasDependenciesFeature = useHasTokenFeature("dependencies");
  const hasAuditAppFeature = useHasTokenFeature("audit_app");
  const canAccessDiagnostics = useSelector(canAccessMonitorDiagnostics);
  const canAccessTools = useSelector(canAccessMonitoringTools);
  const canAccessAlerts = useSelector(canAccessAlertsManagement);

  const upperNav = (
    <>
      {canAccessDiagnostics && (
        <AreaTab
          label={t`Dependency diagnostics`}
          icon="search_check"
          to={Urls.dependencyDiagnostics()}
          isSelected={pathname.startsWith(Urls.dependencyDiagnostics())}
          showLabel={isNavbarOpened}
          isGated={!hasDependenciesFeature}
        />
      )}
      {canAccessTools && (
        <>
          <AreaTab
            label={t`Tasks`}
            icon="clipboard"
            to={Urls.monitorTasks()}
            isSelected={pathname.startsWith(Urls.monitorTasks())}
            showLabel={isNavbarOpened}
          />
          <AreaTab
            label={t`Jobs`}
            icon="clock"
            to={Urls.monitorJobs()}
            isSelected={pathname.startsWith(Urls.monitorJobs())}
            showLabel={isNavbarOpened}
          />
          <AreaTab
            label={t`Logs`}
            icon="audit"
            to={Urls.monitorLogs()}
            isSelected={pathname.startsWith(Urls.monitorLogs())}
            showLabel={isNavbarOpened}
          />
          <AreaTab
            label={t`Erroring questions`}
            icon="warning_round_filled"
            to={Urls.monitorErroringQuestions()}
            isSelected={pathname.startsWith(Urls.monitorErroringQuestions())}
            showLabel={isNavbarOpened}
            isGated={!hasAuditAppFeature}
          />
          <AreaTab
            label={t`Model cache log`}
            icon="database"
            to={Urls.monitorModelCaching()}
            isSelected={pathname.startsWith(Urls.monitorModelCaching())}
            showLabel={isNavbarOpened}
          />
        </>
      )}
      {canAccessAlerts && (
        <AreaTab
          label={t`Alerts management`}
          icon="bell"
          to={Urls.monitorNotifications()}
          isSelected={pathname.startsWith(Urls.monitorNotifications())}
          showLabel={isNavbarOpened}
        />
      )}
    </>
  );

  return (
    <AreaLayout
      logo={<FixedSizeIcon name="gauge" size={28} c="brand" />}
      testId="monitor-nav"
      isLoading={isLoadingNavbarKey}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      upperNav={upperNav}
    >
      <MonitorContent>{children}</MonitorContent>
    </AreaLayout>
  );
}

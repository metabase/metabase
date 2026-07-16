import type { ReactNode } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import {
  canAccessAlertsManagement,
  canAccessMonitorDiagnostics,
  canAccessMonitoringTools,
} from "metabase/common/monitor/selectors";
import {
  AreaLayout,
  AreaTab,
  AreaTabGroup,
} from "metabase/nav/components/AreaLayout";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { FixedSizeIcon } from "metabase/ui";
import * as Urls from "metabase/urls";

import { MonitorContent } from "./MonitorContent";

type MonitorLayoutProps = {
  children?: ReactNode;
};

type MonitorSection =
  | "diagnostics"
  | "erroring-questions"
  | "alerts"
  | "tasks"
  | "jobs"
  | "logs"
  | "model-caching";

function getActiveSection(pathname: string): MonitorSection | null {
  return match(pathname)
    .returnType<MonitorSection | null>()
    .with(
      P.string.startsWith(Urls.dependencyDiagnostics()),
      () => "diagnostics",
    )
    .with(
      P.string.startsWith(Urls.monitorErroringQuestions()),
      () => "erroring-questions",
    )
    .with(P.string.startsWith(Urls.monitorNotifications()), () => "alerts")
    .with(P.string.startsWith(Urls.monitorTasks()), () => "tasks")
    .with(P.string.startsWith(Urls.monitorJobs()), () => "jobs")
    .with(P.string.startsWith(Urls.monitorLogs()), () => "logs")
    .with(
      P.string.startsWith(Urls.monitorModelCaching()),
      () => "model-caching",
    )
    .otherwise(() => null);
}

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

  const activeSection = getActiveSection(pathname);

  const hasContentManagement =
    canAccessDiagnostics || canAccessTools || canAccessAlerts;
  const hasLogsAndActivity = canAccessTools;

  const upperNav = (
    <>
      {hasContentManagement && (
        <AreaTabGroup
          label={t`Content management`}
          showLabel={isNavbarOpened}
          mb="md"
        >
          {canAccessDiagnostics && (
            <AreaTab
              label={t`Dependency diagnostics`}
              icon="search_check"
              to={Urls.dependencyDiagnostics()}
              isSelected={activeSection === "diagnostics"}
              showLabel={isNavbarOpened}
              isGated={!hasDependenciesFeature}
            />
          )}
          {canAccessTools && (
            <AreaTab
              label={t`Erroring questions`}
              icon="warning_round"
              to={Urls.monitorErroringQuestions()}
              isSelected={activeSection === "erroring-questions"}
              showLabel={isNavbarOpened}
              isGated={!hasAuditAppFeature}
            />
          )}
          {canAccessAlerts && (
            <AreaTab
              label={t`Alerts management`}
              icon="bell"
              to={Urls.monitorNotifications()}
              isSelected={activeSection === "alerts"}
              showLabel={isNavbarOpened}
            />
          )}
        </AreaTabGroup>
      )}
      {hasLogsAndActivity && (
        <AreaTabGroup label={t`Logs and activity`} showLabel={isNavbarOpened}>
          <AreaTab
            label={t`Background tasks`}
            icon="clipboard"
            to={Urls.monitorTasks()}
            isSelected={activeSection === "tasks"}
            showLabel={isNavbarOpened}
          />
          <AreaTab
            label={t`Scheduled jobs`}
            icon="clock"
            to={Urls.monitorJobs()}
            isSelected={activeSection === "jobs"}
            showLabel={isNavbarOpened}
          />
          <AreaTab
            label={t`Application logs`}
            icon="audit"
            to={Urls.monitorLogs()}
            isSelected={activeSection === "logs"}
            showLabel={isNavbarOpened}
          />
          <AreaTab
            label={t`Model caching log`}
            icon="bolt"
            to={Urls.monitorModelCaching()}
            isSelected={activeSection === "model-caching"}
            showLabel={isNavbarOpened}
          />
        </AreaTabGroup>
      )}
    </>
  );

  return (
    <AreaLayout
      logo={
        <FixedSizeIcon
          name="pulse"
          transform="scale(0.9, 1.1)"
          size={28}
          c="brand"
        />
      }
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

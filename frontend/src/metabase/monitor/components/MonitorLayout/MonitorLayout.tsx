import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import {
  type MonitorSection,
  trackMonitorSectionClicked,
} from "metabase/common/monitor/analytics";
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
import { Outlet, useLocation } from "metabase/router";
import { FixedSizeIcon, Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import { MonitorContent } from "./MonitorContent";

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

export function MonitorLayout() {
  const {
    value: _isNavbarOpened,
    setValue: setIsNavbarOpened,
    isLoading: isLoadingNavbarKey,
  } = useUserKeyValue({
    namespace: "monitor",
    key: "isNavbarOpened",
  });
  const isNavbarOpened = _isNavbarOpened !== false;

  const { pathname } = useLocation();
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
              onClick={() => trackMonitorSectionClicked("diagnostics")}
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
              onClick={() => trackMonitorSectionClicked("erroring-questions")}
            />
          )}
          {canAccessAlerts && (
            <AreaTab
              label={t`Alerts management`}
              icon="bell"
              to={Urls.monitorNotifications()}
              isSelected={activeSection === "alerts"}
              showLabel={isNavbarOpened}
              onClick={() => trackMonitorSectionClicked("alerts")}
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
            onClick={() => trackMonitorSectionClicked("tasks")}
          />
          <AreaTab
            label={t`Scheduled jobs`}
            icon="clock"
            to={Urls.monitorJobs()}
            isSelected={activeSection === "jobs"}
            showLabel={isNavbarOpened}
            onClick={() => trackMonitorSectionClicked("jobs")}
          />
          <AreaTab
            label={t`Application logs`}
            icon="audit"
            to={Urls.monitorLogs()}
            isSelected={activeSection === "logs"}
            showLabel={isNavbarOpened}
            onClick={() => trackMonitorSectionClicked("logs")}
          />
          <AreaTab
            label={t`Model caching log`}
            icon="bolt"
            to={Urls.monitorModelCaching()}
            isSelected={activeSection === "model-caching"}
            showLabel={isNavbarOpened}
            onClick={() => trackMonitorSectionClicked("model-caching")}
          />
        </AreaTabGroup>
      )}
    </>
  );

  return (
    <AreaLayout
      logo={
        <Flex
          bdrs="50%"
          bg="background_surface-brand-subtle"
          w="2rem"
          h="2rem"
          align="center"
          justify="center"
        >
          <FixedSizeIcon name="pulse" size={14} c="brand" />
        </Flex>
      }
      testId="monitor-nav"
      isLoading={isLoadingNavbarKey}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      upperNav={upperNav}
    >
      <MonitorContent>
        <Outlet />
      </MonitorContent>
    </AreaLayout>
  );
}

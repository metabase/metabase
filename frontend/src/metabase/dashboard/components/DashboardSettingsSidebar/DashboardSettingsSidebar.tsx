import { useCallback } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { toggleAutoApplyFilters } from "metabase/dashboard/actions/parameters";
import { useDashboardContext } from "metabase/dashboard/context";
import { isDashboardCacheable } from "metabase/dashboard/utils";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Switch, useModalsStack } from "metabase/ui";
import type { CacheableDashboard, Dashboard } from "metabase-types/api";

export function DashboardSettingsSidebar() {
  const { dashboard, closeSidebar } = useDashboardContext();
  const { open, state, close } = useModalsStack(["default", "caching"]);

  const currentModal: keyof typeof state = state.caching
    ? "caching"
    : "default";

  useMount(() => {
    // the modal is not rendered until it is "open"
    // but we want to set it open after it mounts to get
    // pretty animations
    open("default");
  });

  if (!dashboard) {
    return null;
  }

  if (currentModal === "caching") {
    return (
      <PLUGIN_CACHING.SidebarCacheForm
        item={dashboard as CacheableDashboard}
        model="dashboard"
        isOpen={state.caching}
        onClose={closeSidebar}
        onBack={() => close("caching")}
        pt="md"
      />
    );
  }

  return (
    <ErrorBoundary>
      <Sidesheet
        isOpen={state.default}
        onClose={closeSidebar}
        closeOnEscape={currentModal === "default"}
        title={t`Dashboard settings`}
        data-testid="dashboard-settings-sidebar"
      >
        <DashboardSidesheetBody dashboard={dashboard} openSidesheet={open} />
      </Sidesheet>
    </ErrorBoundary>
  );
}

export type DashboardSidebarPageProps = {
  dashboard: Dashboard;
  openSidesheet: (sidesheetKey: "caching") => void;
};

const DashboardSidesheetBody = ({
  dashboard,
  openSidesheet,
}: DashboardSidebarPageProps) => {
  const dispatch = useDispatch();

  const handleToggleAutoApplyFilters = useCallback(
    (isAutoApplyingFilters: boolean) => {
      dispatch(toggleAutoApplyFilters(isAutoApplyingFilters));
    },
    [dispatch],
  );

  const autoApplyFilterToggleId = useUniqueId();
  const canWrite = dashboard.can_write && !dashboard.archived;

  const isCacheable = isDashboardCacheable(dashboard);
  const showCaching = canWrite && PLUGIN_CACHING.isGranularCachingEnabled();

  if (dashboard.archived) {
    return null;
  }

  return (
    <>
      <SidesheetCard title={t`General`}>
        <Switch
          disabled={!canWrite}
          label={t`Auto-apply filters`}
          labelPosition="left"
          variant="stretch"
          size="sm"
          id={autoApplyFilterToggleId}
          checked={dashboard.auto_apply_filters}
          onChange={(e) => handleToggleAutoApplyFilters(e.target.checked)}
        />
      </SidesheetCard>
      {showCaching && isCacheable && (
        <SidesheetCard title={t`Caching`}>
          <PLUGIN_CACHING.SidebarCacheSection
            model="dashboard"
            item={dashboard}
            setPage={() => openSidesheet("caching")}
          />
        </SidesheetCard>
      )}
    </>
  );
};

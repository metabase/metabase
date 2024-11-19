import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { toggleAutoApplyFilters } from "metabase/dashboard/actions";
import { isDashboardCacheable } from "metabase/dashboard/utils";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Switch } from "metabase/ui";
import type { CacheableDashboard, Dashboard } from "metabase-types/api";

interface DashboardSettingsSidebarProps {
  dashboard: Dashboard;
  onClose: () => void;
}

export function DashboardSettingsSidebar({
  dashboard,
  onClose,
}: DashboardSettingsSidebarProps) {
  const [page, setPage] = useState<"default" | "caching">("default");

  const [isOpen, setIsOpen] = useState(false);

  useMount(() => {
    // this component is not rendered until it is "open"
    // but we want to set isOpen after it mounts to get
    // pretty animations
    setIsOpen(true);
  });

  if (page === "caching") {
    return (
      <PLUGIN_CACHING.SidebarCacheForm
        item={dashboard as CacheableDashboard}
        model="dashboard"
        onBack={() => setPage("default")}
        onClose={onClose}
        pt="md"
      />
    );
  }

  return (
    <ErrorBoundary>
      <Sidesheet
        isOpen={isOpen}
        title={t`Dashboard settings`}
        onClose={onClose}
        data-testid="dashboard-settings-sidebar"
      >
        <DashboardSidesheetBody
          dashboard={dashboard}
          page={page}
          setPage={setPage}
          isOpen={isOpen}
          onClose={onClose}
        />
      </Sidesheet>
    </ErrorBoundary>
  );
}

export type DashboardSidebarPageProps = {
  dashboard: Dashboard;
  page: "default" | "caching";
  setPage: Dispatch<SetStateAction<"default" | "caching">>;
  isOpen: boolean;
  onClose: () => void;
};

const DashboardSidesheetBody = ({
  dashboard,
  setPage,
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
          onChange={e => handleToggleAutoApplyFilters(e.target.checked)}
        />
      </SidesheetCard>
      {showCaching && isCacheable && (
        <SidesheetCard title={t`Caching`}>
          <PLUGIN_CACHING.SidebarCacheSection
            model="dashboard"
            item={dashboard}
            setPage={setPage}
          />
        </SidesheetCard>
      )}
    </>
  );
};

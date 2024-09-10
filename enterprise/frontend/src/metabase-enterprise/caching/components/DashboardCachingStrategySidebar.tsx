import { useCallback, useMemo } from "react";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import {
  SidesheetCard,
  SidesheetSubPage,
} from "metabase/common/components/Sidesheet";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type {
  CacheStrategy,
  CacheableDashboard,
  CacheableModel,
} from "metabase-types/api";

import { DashboardCachingStrategySidebarBody } from "./DashboardCachingStrategySidebar.styled";

const configurableModels: CacheableModel[] = ["dashboard"];

const _DashboardCachingStrategySidebar = ({
  dashboard,
  setPage,
  router,
  route,
  isOpen,
  onClose,
}: {
  dashboard: CacheableDashboard;
  setPage: (page: "default" | "caching") => void;
  router: InjectedRouter;
  route: Route;
  isOpen: boolean;
  onClose: () => void;
}) => {
  if (typeof dashboard.id === "string") {
    throw new Error("This dashboard has an invalid id");
  }
  const dashboardId: number = dashboard.id;
  const { configs, setConfigs, loading, error } = useCacheConfigs({
    configurableModels,
    id: dashboardId,
  });

  const { savedStrategy, filteredConfigs } = useMemo(() => {
    const targetConfig = _.findWhere(configs, { model_id: dashboardId });
    const savedStrategy = targetConfig?.strategy;
    const filteredConfigs = _.compact([targetConfig]);
    return { savedStrategy, filteredConfigs };
  }, [configs, dashboardId]);

  const saveStrategy = useSaveStrategy(
    dashboardId,
    filteredConfigs,
    setConfigs,
    "dashboard",
  );
  const saveAndCloseSidebar = useCallback(
    async (values: CacheStrategy) => {
      await saveStrategy(values);
      setPage("default");
    },
    [saveStrategy, setPage],
  );

  const closeSidebar = useCallback(async () => {
    setPage("default");
  }, [setPage]);

  const { confirmationModal, setIsStrategyFormDirty, withConfirmation } =
    useConfirmIfFormIsDirty(router, route);

  const goBack = () => setPage("default");

  const headingId = "dashboard-sidebar-caching-settings-heading";

  return (
    <SidesheetSubPage
      isOpen={isOpen}
      title={t`Caching`}
      onBack={() => withConfirmation(goBack)}
      onClose={() => withConfirmation(onClose)}
      size="md"
    >
      <SidesheetCard>
        <DashboardCachingStrategySidebarBody
          align="flex-start"
          spacing="md"
          aria-labelledby={headingId}
        >
          <DelayedLoadingAndErrorWrapper
            loadingMessages={[]}
            loading={loading}
            error={error}
          >
            <StrategyForm
              targetId={dashboardId}
              targetModel="dashboard"
              targetName={dashboard.name}
              isInSidebar
              setIsDirty={setIsStrategyFormDirty}
              saveStrategy={saveAndCloseSidebar}
              savedStrategy={savedStrategy}
              shouldAllowInvalidation
              shouldShowName={false}
              onReset={closeSidebar}
            />
          </DelayedLoadingAndErrorWrapper>
          {confirmationModal}
        </DashboardCachingStrategySidebarBody>
      </SidesheetCard>
    </SidesheetSubPage>
  );
};

export const DashboardCachingStrategySidebar = withRouter(
  _DashboardCachingStrategySidebar,
);

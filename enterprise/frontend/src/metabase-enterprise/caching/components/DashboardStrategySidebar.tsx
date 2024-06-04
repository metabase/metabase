import { useCallback, useMemo } from "react";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { DashboardSidebarPageProps } from "metabase/dashboard/components/DashboardInfoSidebar";
import { color } from "metabase/lib/colors";
import { Button, Flex, Icon, Title } from "metabase/ui";
import type { CacheableModel, Strategy } from "metabase-types/api";

import { DashboardStrategySidebarBody } from "./DashboardStrategySidebar.styled";

const configurableModels: CacheableModel[] = ["dashboard"];

const DashboardStrategySidebar_Base = ({
  dashboard,
  setPage,
  router,
  route,
}: DashboardSidebarPageProps & {
  router: InjectedRouter;
  route: Route;
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
    async (values: Strategy) => {
      await saveStrategy(values);
      setPage("default");
    },
    [saveStrategy, setPage],
  );

  const closeSidebar = useCallback(async () => {
    setPage("default");
  }, [setPage]);

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty(router, route);

  const goBack = () => setPage("default");

  const headingId = "dashboard-sidebar-caching-settings-heading";

  return (
    <DashboardStrategySidebarBody
      align="flex-start"
      spacing="md"
      aria-labelledby={headingId}
    >
      <Flex align="center">
        <BackButton
          onClick={() => {
            isStrategyFormDirty ? askBeforeDiscardingChanges(goBack) : goBack();
          }}
        />
        <Title order={2} id={headingId}>
          Caching settings
        </Title>
      </Flex>
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
    </DashboardStrategySidebarBody>
  );
};

export const DashboardStrategySidebar = withRouter(
  DashboardStrategySidebar_Base,
);

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    lh={0}
    style={{ marginInlineStart: "1rem" }}
    variant="subtle"
    onClick={onClick}
  >
    <Icon name="chevronleft" color={color("text-dark")} />
  </Button>
);

import type { WithRouterProps } from "react-router";

import CS from "metabase/css/core/index.css";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DashboardContextProvider } from "metabase/dashboard/context";
import {
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { SetTitle } from "metabase/hoc/Title";
import { useSelector } from "metabase/lib/redux";
import { Box, Divider, Group, Icon, Stack, Title, Tooltip } from "metabase/ui";

import { usePublicDashboardEndpoints } from "../WithPublicDashboardEndpoints";

export const PublicOrEmbeddedDashboardPage = (props: WithRouterProps) => {
  const { location, router } = props;
  const parameterQueryParams = props.location.query;
  const { dashboardId } = usePublicDashboardEndpoints(props);
  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams,
  });

  useDashboardUrlQuery(router, location);

  const {
    // background,
    // bordered,
    hasNightModeToggle,
    downloadsEnabled,
    hideParameters,
    isFullscreen,
    isNightMode,
    onNightModeChange,
    refreshPeriod,
    onFullscreenChange,
    setRefreshElapsedHook,
    onRefreshPeriodChange,
    // theme,
    // titled,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  const dashboard = useSelector(getDashboardComplete);

  return (
    <>
      <SetTitle title={dashboard?.name} />
      <DashboardContextProvider
        dashboardId={dashboardId}
        isFullscreen={isFullscreen}
        refreshPeriod={refreshPeriod}
        isNightMode={isNightMode}
        hasNightModeToggle={hasNightModeToggle}
        setRefreshElapsedHook={setRefreshElapsedHook}
        onNightModeChange={onNightModeChange}
        onFullscreenChange={onFullscreenChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        // background={background}
        // bordered={bordered}
        downloadsEnabled={downloadsEnabled}
        // theme={theme}
        // titled={titled}
      >
        <Box h="100%" pos="relative">
          <Box bg="bg-white">
            <Group justify="space-between">
              <Title order={2} px="lg">
                <Dashboard.Title />
                <Tooltip label={<Dashboard.Description />}>
                  <Icon ml="md" name="info" />
                </Tooltip>
              </Title>
              <Dashboard.ExportAsPdfButton px="lg" />
            </Group>
            <Box>
              <Dashboard.Tabs px="md" />
              <Divider />
            </Box>
          </Box>
          {!hideParameters && (
            <Box
              px="md"
              pos="sticky"
              top={0}
              className={CS.Overlay}
              bg="bg-white"
            >
              <Dashboard.ParameterList />
            </Box>
          )}
          <Box flex="1">
            <Dashboard.Grid h="100%" w="100%" />
          </Box>
          <Stack bg="bg-white">
            <Divider />
            <Group justify="flex-end" px="sm">
              <Dashboard.RefreshWidget />
              <Dashboard.FullscreenToggle />
              <Dashboard.NightModeToggle />
            </Group>
          </Stack>
        </Box>
      </DashboardContextProvider>
    </>
  );
};

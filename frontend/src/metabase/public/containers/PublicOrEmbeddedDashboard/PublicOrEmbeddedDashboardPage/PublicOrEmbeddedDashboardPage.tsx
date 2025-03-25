import type { WithRouterProps } from "react-router";

import CS from "metabase/css/core/index.css";
import { Grid } from "metabase/dashboard/components/Dashboard/components/Grid";
import { ParameterList } from "metabase/dashboard/components/Dashboard/components/ParameterList";
import { Tabs } from "metabase/dashboard/components/Dashboard/components/Tabs";
import {
  FullscreenToggle,
  NightModeToggleButton,
} from "metabase/dashboard/components/DashboardHeader/buttons";
import { DashboardContextProvider } from "metabase/dashboard/context";
import {
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { SetTitle } from "metabase/hoc/Title";
import { useSelector } from "metabase/lib/redux";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Box, Group, Stack } from "metabase/ui";

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
    background,
    bordered,
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
    theme,
    titled,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  const canWhitelabel = useSelector(getCanWhitelabel);

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
        background={background}
        bordered={bordered}
        downloadsEnabled={downloadsEnabled}
        theme={theme}
        titled={titled}
      >
        <Stack h="100vh" className={CS.overflowHidden}>
          <Tabs />
          <ParameterList />
          <Box className={CS.overflowYScroll} flex={1}>
            <Grid />
          </Box>

          <Group>
            <FullscreenToggle />
            <NightModeToggleButton />
          </Group>
        </Stack>
      </DashboardContextProvider>
    </>
  );
};

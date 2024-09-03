import type { WithRouterProps } from "react-router";

import {
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { SetTitle } from "metabase/hoc/Title";
import { parseHashOptions } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";

import { PublicOrEmbeddedDashboard } from "./PublicOrEmbeddedDashboard";
import { usePublicDashboardEndpoints } from "./WithPublicDashboardEndpoints";

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
    font,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  const dashboard = useSelector(getDashboardComplete);

  const locale = parseHashOptions(props.location.hash)?.["locale"] as
    | string
    | undefined;

  return (
    <>
      <LocaleProvider locale={locale}>
        <SetTitle title={dashboard?.name} />
        <PublicOrEmbeddedDashboard
          dashboardId={dashboardId}
          isFullscreen={isFullscreen}
          refreshPeriod={refreshPeriod}
          hideParameters={hideParameters}
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
          font={font}
          parameterQueryParams={parameterQueryParams}
          cardTitled={true}
        />
      </LocaleProvider>
    </>
  );
};

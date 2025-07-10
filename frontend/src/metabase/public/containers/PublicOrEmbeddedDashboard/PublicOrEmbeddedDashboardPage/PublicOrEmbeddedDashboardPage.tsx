import type { WithRouterProps } from "react-router";

import {
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { setErrorPage } from "metabase/redux/app";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Mode } from "metabase/visualizations/click-actions/Mode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";

import { PublicOrEmbeddedDashboard } from "../PublicOrEmbeddedDashboard";
import { usePublicDashboardEndpoints } from "../WithPublicDashboardEndpoints";

export const PublicOrEmbeddedDashboardPage = (props: WithRouterProps) => {
  const dispatch = useDispatch();

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
    locale,
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

  const canWhitelabel = useSelector(getCanWhitelabel);

  return (
    <LocaleProvider
      locale={canWhitelabel ? locale : undefined}
      shouldWaitForLocale
    >
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
        parameterQueryParams={parameterQueryParams}
        cardTitled={true}
        withFooter={true}
        getClickActionMode={({ question }) => new Mode(question, PublicMode)}
        navigateToNewCardFromDashboard={null}
        onError={(error) => {
          dispatch(setErrorPage(error));
        }}
      />
    </LocaleProvider>
  );
};

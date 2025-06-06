import type { WithRouterProps } from "react-router";

import { DashboardLocationSync } from "metabase/dashboard/containers/DashboardApp/DashboardLocationSync";
import { DashboardContextProvider } from "metabase/dashboard/context";
import { useEmbedTheme } from "metabase/dashboard/hooks";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { useEmbedFrameOptions, useSetEmbedFont } from "metabase/public/hooks";
import { setErrorPage } from "metabase/redux/app";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Mode } from "metabase/visualizations/click-actions/Mode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";

import { PublicOrEmbeddedDashboardView } from "../PublicOrEmbeddedDashboardView";
import { usePublicDashboardEndpoints } from "../WithPublicDashboardEndpoints";

export const PublicOrEmbeddedDashboardPage = (props: WithRouterProps) => {
  const dispatch = useDispatch();

  const { location, router } = props;
  const parameterQueryParams = props.location.query;

  const { dashboardId } = usePublicDashboardEndpoints(props);

  useSetEmbedFont({ location });

  const {
    background,
    bordered,
    titled,
    downloadsEnabled,
    locale,
    hide_parameters,
  } = useEmbedFrameOptions({ location });

  const { hasNightModeToggle, isNightMode, onNightModeChange, theme } =
    useEmbedTheme();

  const canWhitelabel = useSelector(getCanWhitelabel);

  return (
    <LocaleProvider
      locale={canWhitelabel ? locale : undefined}
      shouldWaitForLocale
    >
      <DashboardContextProvider
        dashboardId={dashboardId}
        hideParameters={hide_parameters}
        isNightMode={isNightMode}
        hasNightModeToggle={hasNightModeToggle}
        onNightModeChange={onNightModeChange}
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
      >
        <DashboardLocationSync location={location} />
        <DashboardUrlSync router={router} location={location} />
        <PublicOrEmbeddedDashboardView />
      </DashboardContextProvider>
    </LocaleProvider>
  );
};

function DashboardUrlSync({
  router,
  location,
}: Pick<WithRouterProps, "router" | "location">) {
  useDashboardUrlQuery(router, location);
  return null;
}

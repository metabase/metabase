import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { useDashboardLocationSync } from "metabase/dashboard/containers/DashboardApp/use-dashboard-location-sync";
import { DashboardContextProvider } from "metabase/dashboard/context";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { isActionDashCard, isQuestionCard } from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { useEmbedFrameOptions, useSetEmbedFont } from "metabase/public/hooks";
import { setErrorPage } from "metabase/redux/app";
import { useLocation, useParams } from "metabase/router";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Mode } from "metabase/visualizations/click-actions/Mode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";

import { PublicOrEmbeddedDashboardView } from "../PublicOrEmbeddedDashboardView";
import { usePublicDashboardEndpoints } from "../use-public-dashboard-endpoints";

const PublicOrEmbeddedDashboardPageInner = () => {
  useDashboardLocationSync();
  useDashboardUrlQuery();

  return <PublicOrEmbeddedDashboardView />;
};

export const PublicOrEmbeddedDashboardPage = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const params = useParams();

  const parameterQueryParams = location.query;

  const { dashboardId } = usePublicDashboardEndpoints(params);

  useSetEmbedFont({ location });

  const {
    background,
    bordered,
    titled,
    downloadsEnabled,
    locale,
    hide_parameters,
    theme,
  } = useEmbedFrameOptions({ location });

  const canWhitelabel = useSelector(getCanWhitelabel);

  return (
    <LocaleProvider
      locale={canWhitelabel ? locale : undefined}
      shouldWaitForLocale
    >
      <DashboardContextProvider
        dashboardId={dashboardId}
        hideParameters={hide_parameters}
        theme={theme}
        background={background}
        bordered={bordered}
        downloadsEnabled={downloadsEnabled}
        titled={titled}
        parameterQueryParams={parameterQueryParams}
        cardTitled={true}
        withFooter={true}
        getClickActionMode={({ question }) => new Mode(question, PublicMode)}
        navigateToNewCardFromDashboard={null}
        onError={(error) => {
          dispatch(setErrorPage(error));
        }}
        isDashcardVisible={(dashcard) => !isActionDashCard(dashcard)}
        dashcardMenu={({ dashcard, result }) =>
          downloadsEnabled?.results &&
          isQuestionCard(dashcard.card) &&
          !!result?.data &&
          !result?.error && (
            <PublicOrEmbeddedDashCardMenu result={result} dashcard={dashcard} />
          )
        }
        dashboardActions={DASHBOARD_DISPLAY_ACTIONS}
      >
        <PublicOrEmbeddedDashboardPageInner />
      </DashboardContextProvider>
    </LocaleProvider>
  );
};

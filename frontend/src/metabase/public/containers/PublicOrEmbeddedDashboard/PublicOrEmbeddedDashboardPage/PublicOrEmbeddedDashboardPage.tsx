import type { WithRouterProps } from "react-router";

import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { useDashboardLocationSync } from "metabase/dashboard/containers/DashboardApp/use-dashboard-location-sync";
import { DashboardContextProvider } from "metabase/dashboard/context";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { isActionDashCard, isQuestionCard } from "metabase/dashboard/utils";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { useEmbedFrameOptions, useSetEmbedFont } from "metabase/public/hooks";
import { setErrorPage } from "metabase/redux/app";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Mode } from "metabase/visualizations/click-actions/Mode";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";

import { usePublicEndpoints } from "../../../hooks/use-public-endpoints";
import { PublicOrEmbeddedDashboardView } from "../PublicOrEmbeddedDashboardView";

const PublicOrEmbeddedDashboardPageInner = ({
  location,
  router,
}: WithRouterProps) => {
  useDashboardLocationSync({ location });
  useDashboardUrlQuery(router, location);

  return <PublicOrEmbeddedDashboardView />;
};

export const PublicOrEmbeddedDashboardPage = (props: WithRouterProps) => {
  const dispatch = useDispatch();

  const { location, params } = props;
  const { uuid, token } = params;

  const parameterQueryParams = props.location.query;

  const dashboardId = uuid || token;

  usePublicEndpoints({ uuid, token });

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
      <EmbeddingEntityContextProvider uuid={uuid} token={token}>
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
              <PublicOrEmbeddedDashCardMenu
                result={result}
                dashcard={dashcard}
              />
            )
          }
          dashboardActions={DASHBOARD_DISPLAY_ACTIONS}
        >
          <PublicOrEmbeddedDashboardPageInner {...props} />
        </DashboardContextProvider>
      </EmbeddingEntityContextProvider>
    </LocaleProvider>
  );
};

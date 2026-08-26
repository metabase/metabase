import { useMemo } from "react";

import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { useDashboardLocationSync } from "metabase/dashboard/containers/DashboardApp/use-dashboard-location-sync";
import { DashboardContextProvider } from "metabase/dashboard/context";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks/use-dashboard-url-query";
import { LocaleProvider } from "metabase/embedding/LocaleProvider";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { PublicDashboardMode } from "metabase/public/PublicDashboardMode";
import { useEmbedFrameOptions, useSetEmbedFont } from "metabase/public/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { useLocation, useParams } from "metabase/router";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { parseSearchQuery } from "metabase/utils/browser";
import { isActionDashCard, isQuestionCard } from "metabase/utils/dashboard";
import { Mode } from "metabase/visualizations/click-actions/Mode";
import type { EntityToken } from "metabase-types/api/entity";

import { usePublicEndpoints } from "../../../hooks/use-public-endpoints";
import { PublicOrEmbeddedDashboardView } from "../PublicOrEmbeddedDashboardView";

const PublicOrEmbeddedDashboardPageInner = () => {
  const location = useLocation();

  useDashboardLocationSync({ location });
  useDashboardUrlQuery(location);

  return <PublicOrEmbeddedDashboardView />;
};

export const PublicOrEmbeddedDashboardPage = () => {
  const dispatch = useDispatch();

  const location = useLocation();
  const { uuid, token } = useParams<{ uuid: string; token: EntityToken }>();

  const parameterQueryParams = useMemo(
    () => parseSearchQuery(location.search),
    [location.search],
  );

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

  // The `:uuid` (public) and `:token` (embed) routes each supply exactly one of
  // these, so `dashboardId` is always defined when this page renders.
  if (dashboardId == null) {
    return null;
  }

  return (
    <LocaleProvider
      locale={canWhitelabel ? locale : undefined}
      shouldWaitForLocale
    >
      <EmbeddingEntityContextProvider uuid={uuid ?? null} token={token ?? null}>
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
          getClickActionMode={({ question }) =>
            new Mode(question, PublicDashboardMode)
          }
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
          <PublicOrEmbeddedDashboardPageInner />
        </DashboardContextProvider>
      </EmbeddingEntityContextProvider>
    </LocaleProvider>
  );
};

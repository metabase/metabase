import type { Query } from "history";
import { useEffect, useRef } from "react";
import type { ConnectedProps } from "react-redux";
import { usePrevious, useUnmount } from "react-use";
import _ from "underscore";

import {
  cancelFetchDashboardCardData,
  fetchDashboard,
  fetchDashboardCardData,
  initialize,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import {
  getDashboardComplete,
  getDraftParameterValues,
  getIsNavigatingBackToDashboard,
  getParameterValues,
  getParameters,
  getSelectedTabId,
  getSlowCards,
} from "metabase/dashboard/selectors";
import type {
  DashboardDisplayOptionControls,
  EmbedDisplayParams,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import { connect } from "metabase/lib/redux";
import { type DispatchFn, useDispatch } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { useDashboardLoadHandlers } from "metabase/public/containers/PublicOrEmbeddedDashboard/use-dashboard-load-handlers";
import type { EmbeddingAdditionalHashOptions } from "metabase/public/lib/types";
import { setErrorPage } from "metabase/redux/app";
import type { DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

const mapStateToProps = (state: State) => {
  return {
    dashboard: getDashboardComplete(state),
    slowCards: getSlowCards(state),
    parameters: getParameters(state),
    parameterValues: getParameterValues(state),
    draftParameterValues: getDraftParameterValues(state),
    selectedTabId: getSelectedTabId(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  cancelFetchDashboardCardData,
  setParameterValueToDefault,
  setParameterValue,
  fetchDashboardCardData,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

type ReduxProps = ConnectedProps<typeof connector>;

type OwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams: Query;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
} & PublicOrEmbeddedDashboardEventHandlersProps;

type PublicOrEmbeddedDashboardProps = OwnProps &
  ReduxProps &
  DashboardDisplayOptionControls &
  EmbedDisplayParams &
  Pick<EmbeddingAdditionalHashOptions, "locale">;

const initializeData = async ({
  dashboardId,
  shouldReload,
  parameterQueryParams,
  dispatch,
}: {
  dashboardId: string;
  shouldReload: boolean;
  parameterQueryParams: OwnProps["parameterQueryParams"];
  dispatch: DispatchFn;
}) => {
  dispatch(initialize({ clearCache: shouldReload }));

  const result = await dispatch(
    fetchDashboard({
      dashId: String(dashboardId),
      queryParams: parameterQueryParams,
      options: {
        clearCache: shouldReload,
      },
    }),
  );

  if (!isSuccessfulFetchDashboardResult(result)) {
    dispatch(setErrorPage(result.payload));
    return;
  }

  try {
    if ((result.payload.dashboard?.tabs?.length || 0) === 0) {
      await dispatch(
        fetchDashboardCardData({ reload: false, clearCache: true }),
      );
    }
  } catch (error) {
    console.error(error);
    dispatch(setErrorPage(error));
  }
};

const PublicOrEmbeddedDashboardInner = ({
  dashboard,
  parameters,
  parameterValues,
  draftParameterValues,
  isFullscreen,
  isNightMode = false,
  onFullscreenChange,
  onNightModeChange,
  onRefreshPeriodChange,
  refreshPeriod,
  setRefreshElapsedHook,
  hasNightModeToggle,
  background,
  bordered,
  titled,
  theme,
  downloadsEnabled = true,
  hideParameters,
  navigateToNewCardFromDashboard,
  selectedTabId,
  slowCards,
  dashboardId,
  cardTitled,
  isNavigatingBackToDashboard,
  parameterQueryParams,
  onLoad,
  onLoadWithoutCards,
  cancelFetchDashboardCardData,
  setParameterValueToDefault,
  setParameterValue,
  fetchDashboardCardData,
  locale,
}: PublicOrEmbeddedDashboardProps) => {
  const dispatch = useDispatch();
  const didMountRef = useRef(false);

  const previousDashboardId = usePrevious(dashboardId);
  const previousSelectedTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const shouldFetchCardData = dashboard?.tabs?.length === 0;

  useDashboardLoadHandlers({ dashboard, onLoad, onLoadWithoutCards });

  useEffect(() => {
    if (!didMountRef.current) {
      initializeData({
        dashboardId: String(dashboardId),
        shouldReload: !isNavigatingBackToDashboard,
        parameterQueryParams,
        dispatch,
      });

      didMountRef.current = true;
      return;
    }

    if (dashboardId !== previousDashboardId) {
      initializeData({
        dashboardId: String(dashboardId),
        shouldReload: true,
        parameterQueryParams,
        dispatch,
      });
      return;
    }

    if (selectedTabId && selectedTabId !== previousSelectedTabId) {
      fetchDashboardCardData();
      return;
    }

    if (!_.isEqual(parameterValues, previousParameterValues)) {
      fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }, [
    dashboardId,
    dispatch,
    fetchDashboardCardData,
    isNavigatingBackToDashboard,
    parameterQueryParams,
    parameterValues,
    previousDashboardId,
    previousParameterValues,
    previousSelectedTabId,
    selectedTabId,
    shouldFetchCardData,
  ]);

  useUnmount(() => {
    cancelFetchDashboardCardData();
  });

  return (
    <LocaleProvider locale={locale} shouldWaitForLocale>
      <PublicOrEmbeddedDashboardView
        dashboard={dashboard}
        hasNightModeToggle={hasNightModeToggle}
        isFullscreen={isFullscreen}
        isNightMode={isNightMode}
        onFullscreenChange={onFullscreenChange}
        onNightModeChange={onNightModeChange}
        onRefreshPeriodChange={onRefreshPeriodChange}
        refreshPeriod={refreshPeriod}
        setRefreshElapsedHook={setRefreshElapsedHook}
        selectedTabId={selectedTabId}
        parameters={parameters}
        parameterValues={parameterValues}
        draftParameterValues={draftParameterValues}
        setParameterValue={setParameterValue}
        setParameterValueToDefault={setParameterValueToDefault}
        dashboardId={dashboardId}
        background={background}
        bordered={bordered}
        titled={titled}
        theme={theme}
        hideParameters={hideParameters}
        navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
        slowCards={slowCards}
        cardTitled={cardTitled}
        downloadsEnabled={downloadsEnabled}
      />
    </LocaleProvider>
  );
};

function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

export const PublicOrEmbeddedDashboard = connector(
  PublicOrEmbeddedDashboardInner,
);

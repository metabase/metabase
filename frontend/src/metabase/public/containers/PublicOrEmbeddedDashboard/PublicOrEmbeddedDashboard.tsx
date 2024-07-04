import type { Query } from "history";
import { useCallback, useEffect, useState } from "react";
import type { ConnectedProps } from "react-redux";
import { connect } from "react-redux";
import { useMount, usePrevious, useUnmount } from "react-use";
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
  getParameters,
  getParameterValues,
  getSelectedTabId,
  getSlowCards,
} from "metabase/dashboard/selectors";
import type {
  DashboardDisplayOptionControls,
  EmbedDisplayParams,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import { useDispatch } from "metabase/lib/redux";
import { setErrorPage } from "metabase/redux/app";
import { getErrorPage } from "metabase/selectors/app";
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
    isErrorPage: getErrorPage(state),
  };
};

const mapDispatchToProps = {
  initialize,
  cancelFetchDashboardCardData,
  setParameterValueToDefault,
  setParameterValue,
  setErrorPage,
  fetchDashboard,
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

  onLoad?: () => void;
  onLoadWithCards?: () => void;
};

type DisplayProps = Pick<
  DashboardDisplayOptionControls,
  | "isFullscreen"
  | "isNightMode"
  | "onFullscreenChange"
  | "onNightModeChange"
  | "onRefreshPeriodChange"
  | "refreshPeriod"
  | "setRefreshElapsedHook"
  | "hasNightModeToggle"
>;

type PublicOrEmbeddedDashboardProps = OwnProps &
  ReduxProps &
  DisplayProps &
  EmbedDisplayParams;

const PublicOrEmbeddedDashboardInner = ({
  dashboard,
  parameters,
  parameterValues,
  draftParameterValues,
  isFullscreen,
  isNightMode = false,
  setParameterValueToDefault,
  onFullscreenChange,
  onNightModeChange,
  onRefreshPeriodChange,
  refreshPeriod,
  setRefreshElapsedHook,
  hasNightModeToggle,
  bordered,
  titled,
  theme,
  hideDownloadButton,
  hideParameters,
  navigateToNewCardFromDashboard,
  selectedTabId,
  setParameterValue,
  slowCards,
  dashboardId,
  cardTitled,
  isNavigatingBackToDashboard,
  parameterQueryParams,
  isErrorPage,
  onLoad,
  onLoadWithCards,
}: PublicOrEmbeddedDashboardProps) => {
  const dispatch = useDispatch();
  const previousDashboardId = usePrevious(dashboardId);
  const previousSelectedTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const [isDashboardLoading, setIsDashboardLoading] = useState<boolean>(true);
  const previousIsDashboardLoading = usePrevious(isDashboardLoading);
  const [areCardsLoading, setAreCardsLoading] = useState<boolean>(false);

  const isDashboardWithCardLoading = isDashboardLoading || areCardsLoading;
  const previousIsDashboardWithCardLoading = usePrevious(
    isDashboardWithCardLoading,
  );

  const _initialize = useCallback(
    async (isForceUpdate?: boolean) => {
      const shouldReloadDashboardData =
        !isNavigatingBackToDashboard || !!isForceUpdate;

      initialize({ clearCache: shouldReloadDashboardData });

      setIsDashboardLoading(true);

      const result = await dispatch(
        fetchDashboard({
          dashId: String(dashboardId),
          queryParams: parameterQueryParams,
          options: {
            clearCache: shouldReloadDashboardData,
          },
        }),
      );

      setIsDashboardLoading(false);

      if (!isSuccessfulFetchDashboardResult(result)) {
        setErrorPage(result.payload);
        return;
      }

      setAreCardsLoading(true);

      try {
        if (dashboard?.tabs?.length === 0) {
          await fetchDashboardCardData({ reload: false, clearCache: true });
        }
      } catch (error) {
        console.error(error);
        setErrorPage(error);
      } finally {
        setAreCardsLoading(false);
      }
    },
    [
      dashboard?.tabs?.length,
      dashboardId,
      dispatch,
      isNavigatingBackToDashboard,
      parameterQueryParams,
    ],
  );

  useMount(() => {
    _initialize();
  });

  useUnmount(() => {
    cancelFetchDashboardCardData();
  });

  useEffect(() => {
    if (dashboardId !== previousDashboardId) {
      _initialize(true);
    } else if (selectedTabId !== previousSelectedTabId) {
      fetchDashboardCardData();
    } else if (!_.isEqual(parameterValues, previousParameterValues)) {
      fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }, [
    _initialize,
    dashboardId,
    parameterValues,
    previousDashboardId,
    previousParameterValues,
    previousSelectedTabId,
    selectedTabId,
  ]);

  useEffect(() => {
    if (!isDashboardLoading && previousIsDashboardLoading && !isErrorPage) {
      onLoad?.();
    }
  }, [isDashboardLoading, isErrorPage, onLoad, previousIsDashboardLoading]);

  useEffect(() => {
    if (
      !isDashboardWithCardLoading &&
      previousIsDashboardWithCardLoading &&
      !isErrorPage
    ) {
      onLoadWithCards?.();
    }
  }, [
    isDashboardWithCardLoading,
    isErrorPage,
    onLoadWithCards,
    previousIsDashboardWithCardLoading,
  ]);

  return (
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
      bordered={bordered}
      titled={titled}
      theme={theme}
      hideParameters={hideParameters}
      hideDownloadButton={hideDownloadButton}
      navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
      slowCards={slowCards}
      cardTitled={cardTitled}
    />
  );
};

function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

// Raw PublicOrEmbeddedDashboard used for SDK embedding
export const PublicOrEmbeddedDashboard = connector(
  PublicOrEmbeddedDashboardInner,
);

import { useCallback, useEffect, useState } from "react";
import { connect, type ConnectedProps } from "react-redux";
import { push } from "react-router-redux";
import { usePrevious, useUnmount } from "react-use";
import _ from "underscore";

import type { SdkPluginsConfig } from "embedding-sdk";
import { InteractiveAdHocQuestion } from "embedding-sdk/components/private/InteractiveAdHocQuestion";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { InteractiveDashboardProvider } from "embedding-sdk/components/public/InteractiveDashboard/context";
import {
  type SdkDashboardDisplayProps,
  useSdkDashboardParams,
} from "embedding-sdk/hooks/private/use-sdk-dashboard-params";
import * as dashboardActions from "metabase/dashboard/actions";
import {
  NAVIGATE_TO_NEW_CARD,
  reset as dashboardReset,
} from "metabase/dashboard/actions";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getFavicon,
  getIsAdditionalInfoVisible,
  getIsAddParameterPopoverOpen,
  getIsDashCardsLoadingComplete,
  getIsDashCardsRunning,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsNavigatingBackToDashboard,
  getIsSharing,
  getLoadingStartTime,
  getParameterValues,
  getSelectedTabId,
  getSidebar,
  getSlowCards,
} from "metabase/dashboard/selectors";
import { useDispatch, useStore } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getMetadata } from "metabase/selectors/metadata";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { QuestionDashboardCard } from "metabase-types/api";
import type { State } from "metabase-types/store";

// TODO: Plugins and load events
// TODO: handle "setErrorPage" action for SDK context

const mapStateToProps = (state: State) => {
  return {
    canManageSubscriptions: canManageSubscriptions(state),
    isAdmin: getUserIsAdmin(state),
    isNavbarOpen: getIsNavbarOpen(state),
    isEditing: getIsEditing(state),
    isSharing: getIsSharing(state),
    dashboardBeforeEditing: getDashboardBeforeEditing(state),
    isEditingParameter: getIsEditingParameter(state),
    isDirty: getIsDirty(state),
    dashboard: getDashboardComplete(state),
    slowCards: getSlowCards(state),
    parameterValues: getParameterValues(state),
    loadingStartTime: getLoadingStartTime(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
    isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
    sidebar: getSidebar(state),
    pageFavicon: getFavicon(state),
    documentTitle: getDocumentTitle(state),
    isRunning: getIsDashCardsRunning(state),
    isLoadingComplete: getIsDashCardsLoadingComplete(state),
    isHeaderVisible: getIsHeaderVisible(state),
    isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),
    selectedTabId: getSelectedTabId(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  closeNavbar,
  setErrorPage,
  onChangeLocation: push,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;

export type EditableDashboardProps = SdkDashboardDisplayProps &
  PublicOrEmbeddedDashboardEventHandlersProps & {
    questionHeight?: number;
    plugins?: SdkPluginsConfig;
    className?: string;
  };

const EditableDashboardInner = ({
  dashboardId,
  initialParameterValues = {},
  withTitle = true,
  withCardTitle = true,
  withDownloads = true,
  hiddenParameters = [],
  questionHeight,
  onLoad,
  onLoadWithoutCards,
  className,
  navigateToNewCardFromDashboard,
  ...restProps
}: EditableDashboardProps & ReduxProps) => {
  const {
    displayOptions,
    ref,
    isFullscreen,
    onFullscreenChange,
    refreshPeriod,
    onRefreshPeriodChange,
    setRefreshElapsedHook,
  } = useSdkDashboardParams({
    dashboardId,
    withDownloads,
    withTitle,
    hiddenParameters,
    initialParameterValues,
  });
  const dispatch = useDispatch();
  const store = useStore();

  const [adhocQuestionUrl, setAdhocQuestionUrl] = useState<string | null>(null);
  const previousDashboardId = usePrevious(dashboardId);

  useUnmount(() => {
    console.log("useUnmount dashboardReset");
    dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
  });

  useEffect(() => {
    if (previousDashboardId && dashboardId !== previousDashboardId) {
      console.log("useEffect dashboardReset");
      dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
      setAdhocQuestionUrl(null);
    }
  }, [dashboardId, dispatch, previousDashboardId]);

  const handleNavigateToNewCardFromDashboard = ({
    nextCard,
    previousCard,
    dashcard,
    objectId,
  }: NavigateToNewCardFromDashboardOpts) => {
    const state = store.getState();
    const metadata = getMetadata(state);
    const { dashboards, parameterValues } = state.dashboard;
    const dashboard = dashboards[dashboardId];

    if (dashboard) {
      const url = getNewCardUrl({
        metadata,
        dashboard,
        parameterValues,
        nextCard,
        previousCard,
        dashcard: dashcard as QuestionDashboardCard,
        objectId,
      });

      if (url) {
        dispatch({ type: NAVIGATE_TO_NEW_CARD, payload: { dashboardId } });
        setAdhocQuestionUrl(url);
      }
    }
  };

  const handleNavigateBackToDashboard = () => {
    dispatch(navigateBackToDashboard(dashboardId)); // set global state for cases when navigate back from question with empty results

    setAdhocQuestionUrl(null);
  };

  const onEditQuestion = useCallback(
    (question: Question) => {
      dispatch({ type: NAVIGATE_TO_NEW_CARD, payload: { dashboardId } });
      setAdhocQuestionUrl(Urls.question(question.card()));
    },
    [dashboardId, dispatch],
  );

  const providerPlugins = {};

  // const providerPlugins = useMemo(() => {
  //   return { ...globalPlugins, ...plugins };
  // }, [globalPlugins, plugins]);

  return (
    <Box w="100%" h="100%" ref={ref} className={className}>
      {adhocQuestionUrl ? (
        <InteractiveAdHocQuestion
          questionPath={adhocQuestionUrl}
          withTitle={withTitle}
          height={questionHeight}
          plugins={providerPlugins}
          onNavigateBack={handleNavigateBackToDashboard}
        />
      ) : (
        <InteractiveDashboardProvider
          plugins={providerPlugins}
          onEditQuestion={onEditQuestion}
        >
          <Dashboard
            dashboardId={dashboardId}
            parameterQueryParams={initialParameterValues}
            refreshPeriod={refreshPeriod}
            onRefreshPeriodChange={onRefreshPeriodChange}
            setRefreshElapsedHook={setRefreshElapsedHook}
            isNightMode={false}
            onNightModeChange={_.noop}
            hasNightModeToggle={false}
            isFullscreen={isFullscreen}
            onFullscreenChange={onFullscreenChange}
            navigateToNewCardFromDashboard={
              handleNavigateToNewCardFromDashboard
            }
            {...restProps}
          />
        </InteractiveDashboardProvider>
      )}
    </Box>
  );
};

export const EditableDashboard = _.compose(
  connector,
  withPublicComponentWrapper,
)(EditableDashboardInner);

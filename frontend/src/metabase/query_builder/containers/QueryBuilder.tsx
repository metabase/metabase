import { useHotkeys } from "@mantine/hooks";
import type { Location } from "history";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectedProps } from "react-redux";
import type { Route, WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { useMount, usePrevious, useUnmount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { isRouteInSync } from "metabase/common/hooks/is-route-in-sync";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import { useFavicon } from "metabase/common/hooks/use-favicon";
import { useForceUpdate } from "metabase/common/hooks/use-force-update";
import { useLoadingTimer } from "metabase/common/hooks/use-loading-timer";
import { useWebNotification } from "metabase/common/hooks/use-web-notification";
import Bookmark from "metabase/entities/bookmarks";
import Timelines from "metabase/entities/timelines";
import { usePageTitleWithLoadingTime } from "metabase/hooks/use-page-title";
import { connect, useSelector } from "metabase/lib/redux";
import { closeNavbar } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import {
  canManageSubscriptions,
  getUser,
  getUserIsAdmin,
} from "metabase/selectors/user";
import type {
  BookmarkId,
  Bookmark as BookmarkType,
  Series,
  Timeline,
} from "metabase-types/api";
import type { QueryBuilderUIControls, State } from "metabase-types/store";

import * as actions from "../actions";
import { trackCardBookmarkAdded } from "../analytics";
import { View } from "../components/view/View";
import { VISUALIZATION_SLOW_TIMEOUT } from "../constants";
import {
  getCard,
  getDataReferenceStack,
  getDatabasesList,
  getDocumentTitle,
  getEmbeddedParameterVisibility,
  getFilteredTimelines,
  getFirstQueryResult,
  getIsActionListVisible,
  getIsAdditionalInfoVisible,
  getIsAnySidebarOpen,
  getIsBookmarked,
  getIsDirty,
  getIsHeaderVisible,
  getIsLiveResizable,
  getIsLoadingComplete,
  getIsNativeEditorOpen,
  getIsResultDirty,
  getIsRunnable,
  getIsTimeseries,
  getLastRunCard,
  getModalSnippet,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getOriginalCard,
  getOriginalQuestion,
  getPageFavicon,
  getParameterValues,
  getParameters,
  getQueryResults,
  getQueryStartTime,
  getQuestion,
  getRawSeries,
  getSampleDatabaseId,
  getSelectedTimelineEventIds,
  getShouldShowUnsavedChangesWarning,
  getSnippetCollectionId,
  getTableForeignKeyReferences,
  getTableForeignKeys,
  getTimeseriesXDomain,
  getUiControls,
  getVisibleTimelineEventIds,
  getVisibleTimelineEvents,
  getVisualizationSettings,
  getZoomedObjectRowIndex,
  isResultsMetadataDirty,
} from "../selectors";
import { getIsObjectDetail, getMode } from "../selectors/mode";
import { isNavigationAllowed } from "../utils";

import { useCreateQuestion } from "./use-create-question";
import { useRegisterQueryBuilderMetabotContext } from "./use-register-query-builder-metabot-context";
import { useSaveQuestion } from "./use-save-question";

const timelineProps = {
  query: { include: "events" },
  loadingAndErrorWrapper: false,
};

type BookmarkListLoaderOutput = {
  bookmarks: BookmarkType[];
  reloadBookmarks: () => void;
};

type TimelineListLoaderOutput = {
  timelines: Timeline[];
  reloadTimelines: () => void;
};

type EntityListLoaderMergedProps = {
  allLoading: boolean;
  allLoaded: boolean;
  allFetched: boolean;
  allError: boolean;
  reload: () => void;
} & BookmarkListLoaderOutput &
  TimelineListLoaderOutput;

const mapStateToProps = (state: State, props: EntityListLoaderMergedProps) => {
  return {
    user: getUser(state),
    canManageSubscriptions: canManageSubscriptions(state),
    isAdmin: getUserIsAdmin(state),

    mode: getMode(state),

    question: getQuestion(state),
    originalQuestion: getOriginalQuestion(state),
    lastRunCard: getLastRunCard(state),

    parameterValues: getParameterValues(state),

    tableForeignKeys: getTableForeignKeys(state),
    tableForeignKeyReferences: getTableForeignKeyReferences(state),

    card: getCard(state),
    originalCard: getOriginalCard(state),
    databases: getDatabasesList(state),

    metadata: getMetadata(state),

    timelines: getFilteredTimelines(state),
    timelineEvents: getVisibleTimelineEvents(state),
    selectedTimelineEventIds: getSelectedTimelineEventIds(state),
    visibleTimelineEventIds: getVisibleTimelineEventIds(state),
    xDomain: getTimeseriesXDomain(state),

    result: getFirstQueryResult(state),
    results: getQueryResults(state),
    rawSeries: getRawSeries(state),

    uiControls: getUiControls(state),
    ...state.qb.uiControls,
    dataReferenceStack: getDataReferenceStack(state),
    isAnySidebarOpen: getIsAnySidebarOpen(state),

    isBookmarked: getIsBookmarked(state, props),
    isDirty: getIsDirty(state),
    isObjectDetail: getIsObjectDetail(state),
    isNativeEditorOpen: getIsNativeEditorOpen(state),
    isNavBarOpen: getIsNavbarOpen(state),
    isLiveResizable: getIsLiveResizable(state),
    isTimeseries: getIsTimeseries(state),
    isHeaderVisible: getIsHeaderVisible(state),
    isActionListVisible: getIsActionListVisible(state),
    isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),

    parameters: getParameters(state),
    sampleDatabaseId: getSampleDatabaseId(state),

    isRunnable: getIsRunnable(state),
    isResultDirty: getIsResultDirty(state),
    isMetadataDirty: isResultsMetadataDirty(state),

    visualizationSettings: getVisualizationSettings(state),

    queryStartTime: getQueryStartTime(state),
    nativeEditorCursorOffset: getNativeEditorCursorOffset(state),
    nativeEditorSelectedText: getNativeEditorSelectedText(state),
    modalSnippet: getModalSnippet(state),
    snippetCollectionId: getSnippetCollectionId(state),
    documentTitle: getDocumentTitle(state),
    pageFavicon: getPageFavicon(state),
    isLoadingComplete: getIsLoadingComplete(state),

    zoomedRowIndex: getZoomedObjectRowIndex(state),

    reportTimezone: getSetting(state, "report-timezone-long"),
    didFirstNonTableChartGenerated: getSetting(
      state,
      "non-table-chart-generated",
    ),

    getEmbeddedParameterVisibility: (slug: string) =>
      getEmbeddedParameterVisibility(state, slug),
  };
};

const mapDispatchToProps = {
  ...actions,
  closeNavbar,
  onChangeLocation: push,
  createBookmark: (id: BookmarkId) =>
    Bookmark.actions.create({ id, type: "card" }),
  deleteBookmark: (id: BookmarkId) =>
    Bookmark.actions.delete({ id, type: "card" }),
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;

type QueryBuilderInnerProps = ReduxProps &
  WithRouterProps &
  EntityListLoaderMergedProps & {
    route: Route;
  };

function QueryBuilderInner(props: QueryBuilderInnerProps) {
  useFavicon({ favicon: props.pageFavicon ?? null });

  const {
    question,
    originalQuestion,
    location,
    params,
    uiControls,
    isNativeEditorOpen,
    isAnySidebarOpen,
    closeNavbar,
    initializeQB,
    locationChanged,
    setUIControls,
    runOrCancelQuestionOrSelectedQuery,
    cancelQuery,
    isBookmarked,
    createBookmark,
    deleteBookmark,
    allLoaded,
    showTimelinesForCollection,
    card,
    isAdmin,
    isLoadingComplete,
    closeQB,
    route,
    queryBuilderMode,
    didFirstNonTableChartGenerated,
    setDidFirstNonTableChartRender,
    documentTitle,
    queryStartTime,
  } = props;

  usePageTitleWithLoadingTime(documentTitle || card?.name || t`Question`, {
    titleIndex: 1,
    startTime: queryStartTime,
    isRunning: uiControls.isRunning,
  });

  const didTrackFirstNonTableChartGeneratedRef = useRef(
    didFirstNonTableChartGenerated,
  );
  const handleVisualizationRendered = useCallback(
    (series: Series) => {
      const isNonTable = series[0].card.display !== "table";
      if (
        isAdmin &&
        !didFirstNonTableChartGenerated &&
        !didTrackFirstNonTableChartGeneratedRef.current &&
        isNonTable
      ) {
        setDidFirstNonTableChartRender(card);
        didTrackFirstNonTableChartGeneratedRef.current = true;
      }
    },
    [
      isAdmin,
      card,
      didFirstNonTableChartGenerated,
      setDidFirstNonTableChartRender,
    ],
  );

  const forceUpdate = useForceUpdate();
  const forceUpdateDebounced = useMemo(
    () => _.debounce(forceUpdate, 400),
    [forceUpdate],
  );
  const timeout = useRef<number>();

  const previousUIControls = usePrevious(uiControls);
  const previousLocation = usePrevious(location);
  const wasShowingAnySidebar = usePrevious(isAnySidebarOpen);
  const wasNativeEditorOpen = usePrevious(isNativeEditorOpen);
  const hasQuestion = question != null;
  const collectionId = question?.collectionId();

  const openModal = useCallback(
    (
      modal: QueryBuilderUIControls["modal"],
      modalContext: QueryBuilderUIControls["modalContext"],
    ) => setUIControls({ modal, modalContext }),
    [setUIControls],
  );

  const closeModal = useCallback(
    () => setUIControls({ modal: null, modalContext: null }),
    [setUIControls],
  );

  const onClickBookmark = () => {
    const { card } = props;

    const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;

    if (!isBookmarked) {
      trackCardBookmarkAdded(card);
    }

    toggleBookmark(card.id);
  };

  /**
   * Navigation is scheduled so that LeaveRouteConfirmModal's isEnabled
   * prop has a chance to re-compute on re-render
   */
  const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

  const handleCreate = useCreateQuestion({ scheduleCallback });

  const handleSave = useSaveQuestion({ scheduleCallback });

  useMount(() => {
    // Prevent initializing the query builder if the route is out of sync
    // metabase#65500
    if (!isRouteInSync(location.pathname)) {
      return;
    }

    initializeQB(location, params);
  });

  useRegisterQueryBuilderMetabotContext();

  useEffect(() => {
    window.addEventListener("resize", forceUpdateDebounced);
    return () => window.removeEventListener("resize", forceUpdateDebounced);
  });

  const shouldShowUnsavedChangesWarning = useSelector(
    getShouldShowUnsavedChangesWarning,
  );

  useUnmount(() => {
    cancelQuery();
    closeModal();
    closeQB();
    clearTimeout(timeout.current);
  });

  useEffect(() => {
    if (
      (isAnySidebarOpen && !wasShowingAnySidebar) ||
      (isNativeEditorOpen && !wasNativeEditorOpen)
    ) {
      closeNavbar();
    }
  }, [
    isAnySidebarOpen,
    wasShowingAnySidebar,
    isNativeEditorOpen,
    wasNativeEditorOpen,
    closeNavbar,
  ]);

  useEffect(() => {
    if (allLoaded && hasQuestion) {
      showTimelinesForCollection(collectionId);
    }
  }, [allLoaded, hasQuestion, collectionId, showTimelinesForCollection]);

  useEffect(() => {
    const { isShowingDataReference, isShowingTemplateTagsEditor } = uiControls;
    const {
      isShowingDataReference: wasShowingDataReference,
      isShowingTemplateTagsEditor: wasShowingTemplateTagsEditor,
    } = previousUIControls ?? {};

    if (
      isShowingDataReference !== wasShowingDataReference ||
      isShowingTemplateTagsEditor !== wasShowingTemplateTagsEditor
    ) {
      // when the data reference is toggled we need to trigger a rerender after a short delay in order to
      // ensure that some components are updated after the animation completes (e.g. card visualization)
      timeout.current = window.setTimeout(forceUpdateDebounced, 300);
    }
  }, [uiControls, previousUIControls, forceUpdateDebounced]);

  useEffect(() => {
    if (previousLocation && location !== previousLocation) {
      locationChanged(previousLocation, location, params);
    }
  }, [location, params, previousLocation, locationChanged]);

  const [isShowingToaster, setIsShowingToaster] = useState(false);

  const { isRunning } = uiControls;

  const onTimeout = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") {
      setIsShowingToaster(true);
    }
  }, []);

  useLoadingTimer(isRunning, {
    timer: VISUALIZATION_SLOW_TIMEOUT,
    onTimeout,
  });

  const { requestPermission, showNotification } = useWebNotification();

  useEffect(() => {
    if (isLoadingComplete) {
      setIsShowingToaster(false);

      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        showNotification(
          t`All Set! Your question is ready.`,
          t`${card.name} is loaded.`,
        );
      }
    }
  }, [isLoadingComplete, showNotification, card?.name]);

  const onConfirmToast = useCallback(async () => {
    await requestPermission();
    setIsShowingToaster(false);
  }, [requestPermission]);

  const onDismissToast = useCallback(() => {
    setIsShowingToaster(false);
  }, []);

  const isNewQuestion = !originalQuestion;
  const isLocationAllowed = useCallback(
    (location?: Location) =>
      isNavigationAllowed({
        destination: location,
        question,
        isNewQuestion,
      }),
    [question, isNewQuestion],
  );

  const handleCmdEnter = () => {
    if (queryBuilderMode !== "notebook") {
      runOrCancelQuestionOrSelectedQuery();
    }
  };

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  return (
    <>
      <View
        {...props}
        modal={uiControls.modal}
        recentlySaved={uiControls.recentlySaved}
        onOpenModal={openModal}
        onCloseModal={closeModal}
        onSave={handleSave}
        onCreate={handleCreate}
        handleResize={forceUpdateDebounced}
        toggleBookmark={onClickBookmark}
        onDismissToast={onDismissToast}
        onConfirmToast={onConfirmToast}
        isShowingToaster={isShowingToaster}
        onVisualizationRendered={handleVisualizationRendered}
      />

      <LeaveRouteConfirmModal
        isEnabled={shouldShowUnsavedChangesWarning && !isCallbackScheduled}
        isLocationAllowed={isLocationAllowed}
        route={route}
      />
    </>
  );
}

export const QueryBuilder = _.compose(
  Bookmark.loadList(),
  Timelines.loadList(timelineProps),
  connector,
)(QueryBuilderInner);

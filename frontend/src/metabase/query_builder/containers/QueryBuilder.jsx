/* eslint-disable react/prop-types */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import Bookmark from "metabase/entities/bookmarks";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import { closeNavbar } from "metabase/redux/app";
import { MetabaseApi } from "metabase/services";
import { getMetadata } from "metabase/selectors/metadata";
import {
  getUser,
  getUserIsAdmin,
  canManageSubscriptions,
} from "metabase/selectors/user";

import { useForceUpdate } from "metabase/hooks/use-force-update";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { useOnUnmount } from "metabase/hooks/use-on-unmount";
import { usePrevious } from "metabase/hooks/use-previous";
import { useLoadingTimer } from "../../hooks/use-loading-timer";
import { useWebNotification } from "metabase/hooks/use-web-notification";

import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import favicon from "metabase/hoc/Favicon";

import View from "../components/view/View";
import Toaster from "metabase/components/Toaster";

import {
  getCard,
  getDatabasesList,
  getOriginalCard,
  getLastRunCard,
  getFirstQueryResult,
  getQueryResults,
  getParameterValues,
  getIsDirty,
  getIsNew,
  getIsObjectDetail,
  getTables,
  getTableMetadata,
  getTableForeignKeys,
  getTableForeignKeyReferences,
  getUiControls,
  getParameters,
  getDatabaseFields,
  getSampleDatabaseId,
  getNativeDatabases,
  getIsRunnable,
  getIsResultDirty,
  getMode,
  getModalSnippet,
  getSnippetCollectionId,
  getQuery,
  getQuestion,
  getOriginalQuestion,
  getSettings,
  getQueryStartTime,
  getRawSeries,
  getQuestionAlerts,
  getVisualizationSettings,
  getIsNativeEditorOpen,
  getIsPreviewing,
  getIsPreviewable,
  getIsVisualized,
  getIsLiveResizable,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getIsBookmarked,
  getVisibleTimelineIds,
  getVisibleTimelineEvents,
  getSelectedTimelineEventIds,
  getFilteredTimelines,
  getTimeseriesXDomain,
  getIsAnySidebarOpen,
  getDocumentTitle,
  getPageFavicon,
} from "../selectors";
import * as actions from "../actions";

function autocompleteResults(card, prefix) {
  const databaseId = card && card.dataset_query && card.dataset_query.database;
  if (!databaseId) {
    return [];
  }

  const apiCall = MetabaseApi.db_autocomplete_suggestions({
    dbId: databaseId,
    prefix: prefix,
  });
  return apiCall;
}

const timelineProps = {
  query: { include: "events" },
  loadingAndErrorWrapper: false,
};

const mapStateToProps = (state, props) => {
  return {
    user: getUser(state, props),
    canManageSubscriptions: canManageSubscriptions(state, props),
    isAdmin: getUserIsAdmin(state, props),
    fromUrl: props.location.query.from,

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
    nativeDatabases: getNativeDatabases(state),
    tables: getTables(state),
    tableMetadata: getTableMetadata(state),

    query: getQuery(state),
    metadata: getMetadata(state),

    timelines: getFilteredTimelines(state),
    timelineEvents: getVisibleTimelineEvents(state),
    visibleTimelineIds: getVisibleTimelineIds(state),
    selectedTimelineEventIds: getSelectedTimelineEventIds(state),
    xDomain: getTimeseriesXDomain(state),

    result: getFirstQueryResult(state),
    results: getQueryResults(state),
    rawSeries: getRawSeries(state),

    uiControls: getUiControls(state),
    // includes isShowingDataReference, isEditing, isRunning, etc
    // NOTE: should come before other selectors that override these like getIsPreviewing and getIsNativeEditorOpen
    ...state.qb.uiControls,
    isAnySidebarOpen: getIsAnySidebarOpen(state),

    isBookmarked: getIsBookmarked(state, props),
    isDirty: getIsDirty(state),
    isNew: getIsNew(state),
    isObjectDetail: getIsObjectDetail(state),
    isPreviewing: getIsPreviewing(state),
    isPreviewable: getIsPreviewable(state),
    isNativeEditorOpen: getIsNativeEditorOpen(state),
    isVisualized: getIsVisualized(state),
    isLiveResizable: getIsLiveResizable(state),

    parameters: getParameters(state),
    databaseFields: getDatabaseFields(state),
    sampleDatabaseId: getSampleDatabaseId(state),

    isRunnable: getIsRunnable(state),
    isResultDirty: getIsResultDirty(state),

    questionAlerts: getQuestionAlerts(state),
    visualizationSettings: getVisualizationSettings(state),

    autocompleteResultsFn: prefix => autocompleteResults(state.qb.card, prefix),
    instanceSettings: getSettings(state),

    initialCollectionId: Collections.selectors.getInitialCollectionId(
      state,
      props,
    ),
    queryStartTime: getQueryStartTime(state),
    nativeEditorCursorOffset: getNativeEditorCursorOffset(state),
    nativeEditorSelectedText: getNativeEditorSelectedText(state),
    modalSnippet: getModalSnippet(state),
    snippetCollectionId: getSnippetCollectionId(state),
    documentTitle: getDocumentTitle(state),
    pageFavicon: getPageFavicon(state),
  };
};

const mapDispatchToProps = {
  ...actions,
  closeNavbar,
  onChangeLocation: push,
  createBookmark: id => Bookmark.actions.create({ id, type: "card" }),
  deleteBookmark: id => Bookmark.actions.delete({ id, type: "card" }),
};

function QueryBuilder(props) {
  const {
    question,
    location,
    params,
    fromUrl,
    uiControls,
    isNativeEditorOpen,
    isAnySidebarOpen,
    closeNavbar,
    initializeQB,
    apiCreateQuestion,
    apiUpdateQuestion,
    updateQuestion,
    updateUrl,
    locationChanged,
    onChangeLocation,
    setUIControls,
    cancelQuery,
    isBookmarked,
    createBookmark,
    deleteBookmark,
    allLoaded,
    showTimelinesForCollection,
    card,
  } = props;

  const forceUpdate = useForceUpdate();
  const forceUpdateDebounced = useMemo(() => _.debounce(forceUpdate, 400), [
    forceUpdate,
  ]);
  const timeout = useRef(null);

  const previousUIControls = usePrevious(uiControls);
  const previousLocation = usePrevious(location);
  const wasShowingAnySidebar = usePrevious(isAnySidebarOpen);
  const wasNativeEditorOpen = usePrevious(isNativeEditorOpen);
  const hasQuestion = question != null;
  const collectionId = question?.collectionId();

  const openModal = useCallback(
    (modal, modalContext) => setUIControls({ modal, modalContext }),
    [setUIControls],
  );

  const closeModal = useCallback(
    () => setUIControls({ modal: null, modalContext: null }),
    [setUIControls],
  );

  const setRecentlySaved = useCallback(
    recentlySaved => {
      setUIControls({ recentlySaved });
      clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        setUIControls({ recentlySaved: null });
      }, 5000);
    },
    [setUIControls],
  );

  const onClickBookmark = () => {
    const {
      card: { id },
    } = props;

    const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;

    toggleBookmark(id);
  };

  const handleCreate = useCallback(
    async card => {
      const questionWithUpdatedCard = question.setCard(card);
      await apiCreateQuestion(questionWithUpdatedCard);
      setRecentlySaved("created");
    },
    [question, apiCreateQuestion, setRecentlySaved],
  );

  const handleSave = useCallback(
    async (card, { rerunQuery = false } = {}) => {
      const questionWithUpdatedCard = question.setCard(card);
      await apiUpdateQuestion(questionWithUpdatedCard, { rerunQuery });
      if (!rerunQuery) {
        await updateUrl(questionWithUpdatedCard.card(), { dirty: false });
      }
      if (fromUrl) {
        onChangeLocation(fromUrl);
      } else {
        setRecentlySaved("updated");
      }
    },
    [
      question,
      fromUrl,
      apiUpdateQuestion,
      updateUrl,
      onChangeLocation,
      setRecentlySaved,
    ],
  );

  useOnMount(() => {
    initializeQB(location, params);
  }, []);

  useOnMount(() => {
    window.addEventListener("resize", forceUpdateDebounced);
    return () => window.removeEventListener("resize", forceUpdateDebounced);
  }, []);

  useOnUnmount(() => {
    cancelQuery();
    closeModal();
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
      timeout.current = setTimeout(forceUpdateDebounced, 300);
    }
  }, [uiControls, previousUIControls, forceUpdateDebounced]);

  useEffect(() => {
    if (previousLocation && location !== previousLocation) {
      locationChanged(previousLocation, location, params);
    }
  }, [location, params, previousLocation, locationChanged]);

  useEffect(() => {
    if (question) {
      question._update = updateQuestion;
    }
  });

  const { isRunning } = uiControls;

  const [sendNotification, setSendNotification] = useState(false);
  const [showToaster, setShowToaster] = useState(false);

  const toastTrigger = useLoadingTimer(isRunning, 5000);
  const [requestPermission, showNotification] = useWebNotification();

  useEffect(() => {
    if (toastTrigger) {
      setShowToaster(true);
    }
  }, [toastTrigger]);

  useEffect(() => {
    if (!isRunning) {
      setShowToaster(false);
    }
    if (!isRunning && sendNotification) {
      showNotification(
        `All Set! You question is ready.`,
        `${card.name} is loaded.`,
      );
    }
  }, [isRunning, sendNotification, showNotification, card.name]);

  const handleToastConfirm = async () => {
    const result = await requestPermission();
    if (result === "granted") {
      setShowToaster(false);
      setSendNotification(true);
    }
  };

  return (
    <>
      <View
        {...props}
        modal={uiControls.modal}
        recentlySaved={uiControls.recentlySaved}
        onOpenModal={openModal}
        onCloseModal={closeModal}
        onSetRecentlySaved={setRecentlySaved}
        onSave={handleSave}
        onCreate={handleCreate}
        handleResize={forceUpdateDebounced}
        toggleBookmark={onClickBookmark}
      />
      <Toaster
        message="Would you like to be notified when this question is done loading?"
        show={showToaster}
        onDismiss={() => setShowToaster(false)}
        onConfirm={() => handleToastConfirm()}
        fixed
      />
    </>
  );
}

export default _.compose(
  Bookmark.loadList(),
  Timelines.loadList(timelineProps),
  connect(mapStateToProps, mapDispatchToProps),
  favicon(({ pageFavicon }) => pageFavicon),
  title(({ card, documentTitle }) => ({
    title: documentTitle || card?.name || t`Question`,
    titleIndex: 1,
  })),
  titleWithLoadingTime("queryStartTime"),
)(QueryBuilder);

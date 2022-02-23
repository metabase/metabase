/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import Collections from "metabase/entities/collections";
import { MetabaseApi } from "metabase/services";
import { getMetadata } from "metabase/selectors/metadata";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

import { useForceUpdate } from "metabase/hooks/use-force-update";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { useOnUnmount } from "metabase/hooks/use-on-unmount";
import { usePrevious } from "metabase/hooks/use-previous";

import fitViewport from "metabase/hoc/FitViewPort";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";

import View from "../components/view/View";

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

const mapStateToProps = (state, props) => {
  return {
    user: getUser(state, props),
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

    result: getFirstQueryResult(state),
    results: getQueryResults(state),
    rawSeries: getRawSeries(state),

    uiControls: getUiControls(state),
    // includes isShowingDataReference, isEditing, isRunning, etc
    // NOTE: should come before other selectors that override these like getIsPreviewing and getIsNativeEditorOpen
    ...state.qb.uiControls,

    isBookmarked: getIsBookmarked(state),
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
  };
};

const mapDispatchToProps = {
  ...actions,
  onChangeLocation: push,
  toggleBookmark: Questions.objectActions.toggleBookmark,
};

function QueryBuilder(props) {
  const {
    isBookmarked,
    question,
    location,
    params,
    fromUrl,
    uiControls,
    initializeQB,
    apiCreateQuestion,
    apiUpdateQuestion,
    updateQuestion,
    updateUrl,
    locationChanged,
    onChangeLocation,
    setUIControls,
    cancelQuery,
    toggleBookmark,
  } = props;

  const forceUpdate = useForceUpdate();
  const forceUpdateDebounced = useMemo(() => _.debounce(forceUpdate, 400), [
    forceUpdate,
  ]);
  const timeout = useRef(null);

  const previousUIControls = usePrevious(uiControls);
  const previousLocation = usePrevious(location);

  const openModal = useCallback(modal => setUIControls({ modal }), [
    setUIControls,
  ]);

  const closeModal = useCallback(() => setUIControls({ modal: null }), [
    setUIControls,
  ]);

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

    toggleBookmark(id, !isBookmarked);
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

  return (
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
  );
}

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ card }) => card?.name ?? t`Question`),
  titleWithLoadingTime("queryStartTime"),
  fitViewport,
)(QueryBuilder);

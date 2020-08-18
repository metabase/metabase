/* @flow weak */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import fitViewport from "metabase/hoc/FitViewPort";

import View from "../components/view/View";
// import Notebook from "../components/notebook/Notebook";

import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";

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
  getSampleDatasetId,
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
} from "../selectors";

import { getMetadata } from "metabase/selectors/metadata";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

import * as actions from "../actions";
import { push } from "react-router-redux";

import Collections from "metabase/entities/collections";
import { MetabaseApi } from "metabase/services";

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

    // TODO: data ref
    tableForeignKeys: getTableForeignKeys(state),
    tableForeignKeyReferences: getTableForeignKeyReferences(state),

    // TODO: legacy
    card: getCard(state),
    originalCard: getOriginalCard(state),
    databases: getDatabasesList(state),
    nativeDatabases: getNativeDatabases(state),
    tables: getTables(state),
    tableMetadata: getTableMetadata(state),

    // TODO: redundant, accessible through question
    query: getQuery(state),
    metadata: getMetadata(state),

    result: getFirstQueryResult(state),
    results: getQueryResults(state),
    rawSeries: getRawSeries(state),

    uiControls: getUiControls(state),
    // includes isShowingDataReference, isEditing, isRunning, etc
    // NOTE: should come before other selectors that override these like getIsPreviewing and getIsNativeEditorOpen
    ...state.qb.uiControls,

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
    sampleDatasetId: getSampleDatasetId(state),

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
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
@title(({ card }) => (card && card.name) || t`Question`)
@titleWithLoadingTime("queryStartTime")
@fitViewport
export default class QueryBuilder extends Component {
  timeout: any;

  forceUpdateDebounced: () => void;

  constructor(props, context) {
    super(props, context);

    // TODO: React tells us that forceUpdate() is not the best thing to use, so ideally we can find a different way to trigger this
    this.forceUpdateDebounced = _.debounce(this.forceUpdate.bind(this), 400);
  }

  componentWillMount() {
    this.props.initializeQB(this.props.location, this.props.params);
  }

  componentDidMount() {
    window.addEventListener("resize", this.handleResize);
  }

  componentWillReceiveProps(nextProps) {
    if (
      nextProps.uiControls.isShowingDataReference !==
        this.props.uiControls.isShowingDataReference ||
      nextProps.uiControls.isShowingTemplateTagsEditor !==
        this.props.uiControls.isShowingTemplateTagsEditor
    ) {
      // when the data reference is toggled we need to trigger a rerender after a short delay in order to
      // ensure that some components are updated after the animation completes (e.g. card visualization)
      window.setTimeout(this.forceUpdateDebounced, 300);
    }

    if (nextProps.location !== this.props.location) {
      nextProps.locationChanged(
        this.props.location,
        nextProps.location,
        nextProps.params,
      );
    }

    // NOTE: not sure if there's a better way to bind an action to something returned in mapStateToProps
    // Could stack like so  and do it in a selector but ugh
    //    @connect(null, { updateQuestion })
    //    @connect(mapStateToProps, mapDispatchToProps)
    if (nextProps.question) {
      window.question = nextProps.question;
      nextProps.question._update = nextProps.updateQuestion;
    }
  }

  componentDidUpdate() {
    const viz = ReactDOM.findDOMNode(this.refs.viz);
    if (viz) {
      viz.style.opacity = 1.0;
    }
  }

  componentWillUnmount() {
    // cancel the query if one is running
    this.props.cancelQuery();

    window.removeEventListener("resize", this.handleResize);

    clearTimeout(this.timeout);

    this.closeModal(); // close any modal that might be open
  }

  // When the window is resized we need to re-render, mainly so that our visualization pane updates
  // Debounce the function to improve resizing performance.
  handleResize = e => {
    this.forceUpdateDebounced();
    const viz = ReactDOM.findDOMNode(this.refs.viz);
    if (viz) {
      viz.style.opacity = 0.2;
    }
  };

  // NOTE: these were lifted from QueryHeader. Move to Redux?
  openModal = modal => {
    this.props.setUIControls({ modal });
  };
  closeModal = () => {
    this.props.setUIControls({ modal: null });
  };

  setRecentlySaved = recentlySaved => {
    this.props.setUIControls({ recentlySaved });
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.props.setUIControls({ recentlySaved: null });
    }, 5000);
  };

  handleCreate = async card => {
    const { question, apiCreateQuestion } = this.props;
    const questionWithUpdatedCard = question.setCard(card);
    await apiCreateQuestion(questionWithUpdatedCard);

    this.setRecentlySaved("created");
  };

  handleSave = async card => {
    const { question, apiUpdateQuestion } = this.props;
    const questionWithUpdatedCard = question.setCard(card);
    await apiUpdateQuestion(questionWithUpdatedCard);

    if (this.props.fromUrl) {
      this.props.onChangeLocation(this.props.fromUrl);
    } else {
      this.setRecentlySaved("updated");
    }
  };

  resetStateOnTimeout = () => {
    // clear any previously set timeouts then start a new one
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.props.onSetRecentlySaved(null);
      this.timeout = null;
    }, 5000);
  };

  render() {
    const {
      uiControls: { modal, recentlySaved },
    } = this.props;

    // const Panel = queryBuilderMode === "notebook" ? Notebook : View;
    const Panel = View;

    return (
      <Panel
        {...this.props}
        // NOTE: these were lifted from QueryHeader. Move to Redux?
        modal={modal}
        onOpenModal={this.openModal}
        onCloseModal={this.closeModal}
        // recently saved indication
        recentlySaved={recentlySaved}
        onSetRecentlySaved={this.setRecentlySaved}
        // save/create actions
        onSave={this.handleSave}
        onCreate={this.handleCreate}
        handleResize={this.handleResize}
      />
    );
  }
}

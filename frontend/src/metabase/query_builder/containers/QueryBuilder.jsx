/* @flow weak */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { loadTableAndForeignKeys } from "metabase/lib/table";

import fitViewport from "metabase/hoc/FitViewPort";

import View from "../components/view/View";
// import Notebook from "../components/notebook/Notebook";

import title from "metabase/hoc/Title";

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
  getQuery,
  getQuestion,
  getOriginalQuestion,
  getSettings,
  getRawSeries,
  getQuestionAlerts,
  getVisualizationSettings,
  getIsNativeEditorOpen,
  getIsPreviewing,
  getIsPreviewable,
} from "../selectors";

import { getMetadata } from "metabase/selectors/metadata";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

import * as actions from "../actions";
import { push } from "react-router-redux";

import { MetabaseApi } from "metabase/services";

function autocompleteResults(card, prefix) {
  const databaseId = card && card.dataset_query && card.dataset_query.database;
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

    question: getQuestion(state),
    query: getQuery(state),

    mode: getMode(state),

    card: getCard(state),
    originalCard: getOriginalCard(state),
    originalQuestion: getOriginalQuestion(state),
    lastRunCard: getLastRunCard(state),

    parameterValues: getParameterValues(state),

    databases: getDatabasesList(state),
    nativeDatabases: getNativeDatabases(state),
    tables: getTables(state),
    tableMetadata: getTableMetadata(state),
    metadata: getMetadata(state),

    tableForeignKeys: getTableForeignKeys(state),
    tableForeignKeyReferences: getTableForeignKeyReferences(state),

    result: getFirstQueryResult(state),
    results: getQueryResults(state),
    rawSeries: getRawSeries(state),

    uiControls: getUiControls(state),
    // includes isShowingDataReference, isShowingTutorial, isEditing, isRunning, etc
    // NOTE: should come before other selectors that override these like getIsPreviewing and getIsNativeEditorOpen
    ...state.qb.uiControls,

    isDirty: getIsDirty(state),
    isNew: getIsNew(state),
    isObjectDetail: getIsObjectDetail(state),
    isPreviewing: getIsPreviewing(state),
    isPreviewable: getIsPreviewable(state),
    isNativeEditorOpen: getIsNativeEditorOpen(state),

    parameters: getParameters(state),
    databaseFields: getDatabaseFields(state),
    sampleDatasetId: getSampleDatasetId(state),

    isRunnable: getIsRunnable(state),
    isResultDirty: getIsResultDirty(state),

    questionAlerts: getQuestionAlerts(state),
    visualizationSettings: getVisualizationSettings(state),

    loadTableAndForeignKeysFn: loadTableAndForeignKeys,
    autocompleteResultsFn: prefix => autocompleteResults(state.qb.card, prefix),
    instanceSettings: getSettings(state),
  };
};

const getURL = (location, { includeMode = false } = {}) =>
  // strip off trailing queryBuilderMode
  (includeMode
    ? location.pathname
    : location.pathname.replace(/\/(notebook|view)$/, "")) +
  location.search +
  location.hash;

const isSavedQuestionUrl = url => /\/question\/\d+$/.test(url);

const mapDispatchToProps = {
  ...actions,
  onChangeLocation: push,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
@title(({ card }) => (card && card.name) || t`Question`)
@fitViewport
export default class QueryBuilder extends Component {
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
      if (nextProps.location.action === "POP") {
        if (
          getURL(nextProps.location, { includeMode: true }) !==
          getURL(this.props.location, { includeMode: true })
        ) {
          // the browser forward/back button was pressed
          this.props.popState(nextProps.location);
          // ----------------------------------------------
          // TODO -- figure out what's up here. as this is needed for header breadcrumbs to work
          // ----------------------------------------------
          // NOTE: Tom Robinson 4/16/2018: disabled for now. this is to enable links
          // from qb to other qb questions but it's also triggering when changing
          // the display type
        }
      } else if (nextProps.location.action === "PUSH") {
        if (
          getURL(nextProps.location) !== getURL(this.props.location) &&
          nextProps.question &&
          getURL(nextProps.location) !== nextProps.question.getUrl()
        ) {
          // a link to a different qb url was clicked
          this.props.initializeQB(nextProps.location, nextProps.params);
        } else if (
          this.props.location.hash !== "#?tutorial" &&
          nextProps.location.hash === "#?tutorial"
        ) {
          // tutorial link was clicked
          this.props.initializeQB(nextProps.location, nextProps.params);
        } else if (
          getURL(nextProps.location) === "/question" &&
          getURL(this.props.location) !== "/question"
        ) {
          // "New Question" link was clicked
          this.props.initializeQB(nextProps.location, nextProps.params);
        } else if (
          isSavedQuestionUrl(getURL(nextProps.location)) &&
          getURL(this.props.location) !== getURL(nextProps.location)
        ) {
          // a saved question link was clicked, e.x. lineage
          this.props.initializeQB(nextProps.location, nextProps.params);
        }
      }
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

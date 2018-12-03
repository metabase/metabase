/* @flow weak */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { t } from "c-3po";
import cx from "classnames";
import _ from "underscore";

import { loadTableAndForeignKeys } from "metabase/lib/table";

import fitViewport from "metabase/hoc/FitViewPort";

import QueryBuilderTutorial from "metabase/tutorial/QueryBuilderTutorial.jsx";

import QueryHeader from "../components/QueryHeader.jsx";
import GuiQueryEditor from "../components/GuiQueryEditor.jsx";
import NativeQueryEditor from "../components/NativeQueryEditor.jsx";
import QueryVisualization from "../components/QueryVisualization.jsx";
import DataReference from "../components/dataref/DataReference.jsx";
import TagEditorSidebar from "../components/template_tags/TagEditorSidebar.jsx";
import SavedQuestionIntroModal from "../components/SavedQuestionIntroModal.jsx";
import ActionsWidget from "../components/ActionsWidget.jsx";

import title from "metabase/hoc/Title";

import {
  getCard,
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
} from "../selectors";

import { getMetadata, getDatabasesList } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";

import * as actions from "../actions";
import { push } from "react-router-redux";

import { MetabaseApi } from "metabase/services";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

function autocompleteResults(card, prefix) {
  let databaseId = card && card.dataset_query && card.dataset_query.database;
  let apiCall = MetabaseApi.db_autocomplete_suggestions({
    dbId: databaseId,
    prefix: prefix,
  });
  return apiCall;
}

const mapStateToProps = (state, props) => {
  return {
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

    isDirty: getIsDirty(state),
    isNew: getIsNew(state),
    isObjectDetail: getIsObjectDetail(state),

    uiControls: getUiControls(state),
    parameters: getParameters(state),
    databaseFields: getDatabaseFields(state),
    sampleDatasetId: getSampleDatasetId(state),

    isShowingDataReference: state.qb.uiControls.isShowingDataReference,
    isShowingTutorial: state.qb.uiControls.isShowingTutorial,
    isEditing: state.qb.uiControls.isEditing,
    isRunning: state.qb.uiControls.isRunning,
    isRunnable: getIsRunnable(state),
    isResultDirty: getIsResultDirty(state),

    loadTableAndForeignKeysFn: loadTableAndForeignKeys,
    autocompleteResultsFn: prefix => autocompleteResults(state.qb.card, prefix),
    instanceSettings: getSettings(state),
  };
};

const getURL = location => location.pathname + location.search + location.hash;

const mapDispatchToProps = {
  ...actions,
  onChangeLocation: push,
};

@connect(mapStateToProps, mapDispatchToProps)
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

    if (
      nextProps.location.action === "POP" &&
      getURL(nextProps.location) !== getURL(this.props.location)
    ) {
      // the browser forward/back button was pressed
      this.props.popState(nextProps.location);
      // NOTE: Tom Robinson 4/16/2018: disabled for now. this is to enable links
      // from qb to other qb questions but it's also triggering when changing
      // the display type
      // } else if (
      //   nextProps.location.action === "PUSH" &&
      //   getURL(nextProps.location) !== getURL(this.props.location) &&
      //   nextProps.question &&
      //   getURL(nextProps.location) !== nextProps.question.getUrl()
      // ) {
      //   // a link to a different qb url was clicked
      //   this.props.initializeQB(nextProps.location, nextProps.params);
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
    }
  }

  componentDidUpdate() {
    let viz = ReactDOM.findDOMNode(this.refs.viz);
    if (viz) {
      viz.style.opacity = 1.0;
    }
  }

  componentWillUnmount() {
    // cancel the query if one is running
    this.props.cancelQuery();

    window.removeEventListener("resize", this.handleResize);
  }

  // When the window is resized we need to re-render, mainly so that our visualization pane updates
  // Debounce the function to improve resizing performance.
  handleResize = e => {
    this.forceUpdateDebounced();
    let viz = ReactDOM.findDOMNode(this.refs.viz);
    if (viz) {
      viz.style.opacity = 0.2;
    }
  };

  render() {
    return <LegacyQueryBuilder {...this.props} />;
  }
}

class LegacyQueryBuilder extends Component {
  render() {
    const { query, card, isDirty, databases, uiControls, mode } = this.props;

    // if we don't have a card at all or no databases then we are initializing, so keep it simple
    if (!card || !databases) {
      return <div />;
    }

    const showDrawer =
      uiControls.isShowingDataReference ||
      uiControls.isShowingTemplateTagsEditor;
    const ModeFooter = mode && mode.ModeFooter;

    return (
      <div className={this.props.fitClassNames}>
        <div
          className={cx("QueryBuilder flex flex-column bg-white spread", {
            "QueryBuilder--showSideDrawer": showDrawer,
          })}
        >
          <div id="react_qb_header">
            <QueryHeader {...this.props} />
          </div>

          <div id="react_qb_editor" className="z2 hide sm-show">
            {query instanceof NativeQuery ? (
              <NativeQueryEditor
                {...this.props}
                isOpen={!card.dataset_query.native.query || isDirty}
                datasetQuery={card && card.dataset_query}
              />
            ) : query instanceof StructuredQuery ? (
              <div className="wrapper">
                <GuiQueryEditor
                  {...this.props}
                  datasetQuery={card && card.dataset_query}
                />
              </div>
            ) : null}
          </div>

          <div
            ref="viz"
            id="react_qb_viz"
            className="flex z1"
            style={{ transition: "opacity 0.25s ease-in-out" }}
          >
            <QueryVisualization
              {...this.props}
              className="full wrapper mb2 z1"
            />
          </div>

          {ModeFooter && (
            <ModeFooter {...this.props} className="flex-no-shrink" />
          )}
        </div>

        <div
          className={cx("SideDrawer hide sm-show", {
            "SideDrawer--show": showDrawer,
          })}
        >
          {uiControls.isShowingDataReference && (
            <DataReference
              {...this.props}
              onClose={() => this.props.toggleDataReference()}
            />
          )}

          {uiControls.isShowingTemplateTagsEditor &&
            query instanceof NativeQuery && (
              <TagEditorSidebar
                {...this.props}
                onClose={() => this.props.toggleTemplateTagsEditor()}
              />
            )}
        </div>

        {uiControls.isShowingTutorial && (
          <QueryBuilderTutorial onClose={() => this.props.closeQbTutorial()} />
        )}

        {uiControls.isShowingNewbModal && (
          <SavedQuestionIntroModal
            onClose={() => this.props.closeQbNewbModal()}
          />
        )}

        <ActionsWidget {...this.props} className="z2 absolute bottom right" />
      </div>
    );
  }
}

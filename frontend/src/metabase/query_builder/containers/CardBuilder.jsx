/* @flow weak */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import cx from "classnames";
import _ from "underscore";

import { loadTableAndForeignKeys } from "metabase/lib/table";
import { isPK, isFK } from "metabase/lib/types";

import CardHeader from "metabase/query_builder/components/CardHeader";
import CardEditor from "metabase/query_builder/components/CardEditor";
import QueryVisualization from "../components/QueryVisualization.jsx";
import DataReference from "../components/dataref/DataReference.jsx";
import TagEditorSidebar from "../components/template_tags/TagEditorSidebar.jsx";

import title from "metabase/hoc/Title";

import {
    getOriginalCard,
    getLastRunCard,
    getQueryResult,
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
    getQuestion,
    getOriginalQuestion
} from "../selectors";

import { getMetadata, getDatabasesList } from "metabase/selectors/metadata";

import { getUserIsAdmin } from "metabase/selectors/user";

import * as actions from "../actions";
import { push } from "react-router-redux";

import { MetabaseApi } from "metabase/services";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import VisualizationSettings from "metabase/query_builder/components/VisualizationSettings";
import ActionsWidget from "metabase/query_builder/components/ActionsWidget";
import CardFiltersWidget from "metabase/query_builder/components/CardFiltersWidget";

function cellIsClickable(queryResult, rowIndex, columnIndex) {
    if (!queryResult) return false;

    // lookup the coldef and cell value of the cell we are curious about
    var coldef = queryResult.data.cols[columnIndex];

    if (!coldef || !coldef.special_type) return false;

    return (coldef.table_id != null && (isPK(coldef.special_type) || (isFK(coldef.special_type) && coldef.target)));
}

function autocompleteResults(card, prefix) {
    let databaseId = card && card.dataset_query && card.dataset_query.database;
    let apiCall = MetabaseApi.db_autocomplete_suggestions({
        dbId: databaseId,
        prefix: prefix
    });
    return apiCall;
}

const mapStateToProps = (state, props) => {
    return {
        isAdmin:                   getUserIsAdmin(state, props),
        fromUrl:                   props.location.query.from,

        question:                  getQuestion(state),
        originalQuestion:          getOriginalQuestion(state),
        mode:                      getMode(state),

        originalCard:              getOriginalCard(state),
        lastRunCard:               getLastRunCard(state),

        parameterValues:           getParameterValues(state),

        databases:                 getDatabasesList(state),
        nativeDatabases:           getNativeDatabases(state),
        tables:                    getTables(state),
        tableMetadata:             getTableMetadata(state),
        metadata:                  getMetadata(state),

        tableForeignKeys:          getTableForeignKeys(state),
        tableForeignKeyReferences: getTableForeignKeyReferences(state),

        result:                    getQueryResult(state),

        isDirty:                   getIsDirty(state),
        isNew:                     getIsNew(state),
        isObjectDetail:            getIsObjectDetail(state),

        uiControls:                getUiControls(state),
        parameters:                getParameters(state),
        databaseFields:            getDatabaseFields(state),
        sampleDatasetId:           getSampleDatasetId(state),

        isShowingDataReference:    state.qb.uiControls.isShowingDataReference,
        isShowingTutorial:         state.qb.uiControls.isShowingTutorial,
        isEditing:                 state.qb.uiControls.isEditing,
        isRunning:                 state.qb.uiControls.isRunning,
        isRunnable:                getIsRunnable(state),
        isResultDirty:             getIsResultDirty(state),

        loadTableAndForeignKeysFn: loadTableAndForeignKeys,
        autocompleteResultsFn:     (prefix) => autocompleteResults(state.qb.card, prefix),
        cellIsClickableFn:         (rowIndex, columnIndex) => cellIsClickable(state.qb.queryResult, rowIndex, columnIndex)
    }
}

const getURL = (location) =>
location.pathname + location.search + location.hash;


const mapDispatchToProps = {
    ...actions,
    onChangeLocation: push
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ question }) => (question && question.displayName()) || "Question")
export default class CardBuilder extends Component {
    forceUpdateDebounced: () => void;

    constructor(props, context) {
        super(props, context);

        // TODO: React tells us that forceUpdate() is not the best thing to use, so ideally we can find a different way to trigger this
        this.forceUpdateDebounced = _.debounce(this.forceUpdate.bind(this), 400);
    }

    componentWillMount() {
        if (!this.props.qbIsAlreadyInitialized) {
            this.props.initializeQB(this.props.location, this.props.params);
        }
    }

    componentDidMount() {
        window.addEventListener("resize", this.handleResize);
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.uiControls.isShowingDataReference !== this.props.uiControls.isShowingDataReference ||
            nextProps.uiControls.isShowingTemplateTagsEditor !== this.props.uiControls.isShowingTemplateTagsEditor) {
            // when the data reference is toggled we need to trigger a rerender after a short delay in order to
            // ensure that some components are updated after the animation completes (e.g. card visualization)
            window.setTimeout(this.forceUpdateDebounced, 300);
        }

        if (nextProps.location.action === "POP" && getURL(nextProps.location) !== getURL(this.props.location)) {
            this.props.popState(nextProps.location);
        } else if (this.props.location.hash !== "#?tutorial" && nextProps.location.hash === "#?tutorial") {
            this.props.initializeQB(nextProps.location, nextProps.params);
        } else if (getURL(nextProps.location) === "/question" && getURL(this.props.location) !== "/question") {
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
    handleResize = (e) => {
        this.forceUpdateDebounced();
        let viz = ReactDOM.findDOMNode(this.refs.viz);
        if (viz) {
            viz.style.opacity = 0.2;
        }
    };

    render() {
        const { question, databases, uiControls, mode } = this.props;
        const datasetQuery = question && question.datasetQuery();

        const showDrawer = uiControls.isShowingDataReference || uiControls.isShowingTemplateTagsEditor;
        const ModeFooter = mode && mode.ModeFooter;
        const isInitializing = !question || !databases;
        const showVisualizationSettings = !this.props.isObjectDetail;

        return (
            <LoadingAndErrorWrapper loading={isInitializing} noBackground={true} showSpinner={false}>
                { () =>
                    <div className="flex-full flex relative">
                        <div className={cx("QueryBuilder flex flex-column bg-white spread", {"QueryBuilder--showSideDrawer": showDrawer})}>
                            <div id="react_qb_header">
                                <CardHeader {...this.props}/>
                            </div>

                            <div id="react_qb_editor" className="z2 hide sm-show mb2">
                                <div className="wrapper">
                                    <CardEditor
                                        {...this.props}
                                        datasetQuery={datasetQuery}
                                    />
                                </div>
                            </div>

                            <div ref="viz" id="react_qb_viz" className="flex z1" style={{ "transition": "opacity 0.25s ease-in-out" }}>
                                <QueryVisualization
                                    {...this.props}
                                    card={question.card()}
                                    noHeader
                                    className="full wrapper mb2 z1"
                                />
                            </div>

                            { ModeFooter ?
                                <ModeFooter {...this.props} className="flex-no-shrink" />
                                : <div style={{height: "70px"}} />
                            }
                        </div>

                        <div className={cx("SideDrawer hide sm-show", { "SideDrawer--show": showDrawer })}>
                            { uiControls.isShowingDataReference &&
                                <DataReference {...this.props} onClose={() => this.props.toggleDataReference()} />
                            }

                            { uiControls.isShowingTemplateTagsEditor &&
                                <TagEditorSidebar {...this.props} onClose={() => this.props.toggleTemplateTagsEditor()} />
                            }
                        </div>

                        { showVisualizationSettings &&
                            <div className="z2 absolute left bottom mb3 ml4">
                                <div style={{backgroundColor: "white"}}>
                                    <VisualizationSettings
                                        ref="settings"
                                        {...this.props}
                                        card={question.card()}
                                    />
                                </div>
                            </div>
                        }

                        <div className="z2 absolute right bottom mb3" style={{marginRight: "80px"}}>
                            <CardFiltersWidget
                                {...this.props}
                                datasetQuery={datasetQuery}
                            />
                        </div>

                        <ActionsWidget {...this.props} className="z2 absolute bottom right" />
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

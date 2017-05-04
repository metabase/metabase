import React, { Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import cx from "classnames";
import _ from "underscore";

import { loadTableAndForeignKeys } from "metabase/lib/table";
import { isPK, isFK } from "metabase/lib/types";

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
} from "../selectors";

import { getMetadata, getDatabasesList } from "metabase/selectors/metadata";

import { getUserIsAdmin } from "metabase/selectors/user";

import * as actions from "../actions";
import { push } from "react-router-redux";

import { MetabaseApi } from "metabase/services";

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

        mode:                      getMode(state),

        card:                      getCard(state),
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
@title(({ card }) => (card && card.name) || "Question")
export default class QueryBuilder extends Component {

    constructor(props, context) {
        super(props, context);

        // TODO: React tells us that forceUpdate() is not the best thing to use, so ideally we can find a different way to trigger this
        this.forceUpdateDebounced = _.debounce(this.forceUpdate.bind(this), 400);

        this.state = {
            legacy: true
        }
    }

    componentWillMount() {
        this.props.initializeQB(this.props.location, this.props.params);
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
    }

    render() {
        return (
            <div className="flex-full flex relative">
                <LegacyQueryBuilder {...this.props} />
            </div>
        )
    }
}

class LegacyQueryBuilder extends Component {
    render() {
        const { card, isDirty, databases, uiControls, mode } = this.props;

        // if we don't have a card at all or no databases then we are initializing, so keep it simple
        if (!card || !databases) {
            return (
                <div></div>
            );
        }

        const showDrawer = uiControls.isShowingDataReference || uiControls.isShowingTemplateTagsEditor;
        const ModeFooter = mode && mode.ModeFooter;

        return (
            <div className="flex-full relative">
                <div className={cx("QueryBuilder flex flex-column bg-white spread", {"QueryBuilder--showSideDrawer": showDrawer})}>
                    <div id="react_qb_header">
                        <QueryHeader {...this.props}/>
                    </div>

                    <div id="react_qb_editor" className="z2 hide sm-show">
                        { card && card.dataset_query && card.dataset_query.type === "native" ?
                            <NativeQueryEditor
                                {...this.props}
                                isOpen={!card.dataset_query.native.query || isDirty}
                                datasetQuery={card && card.dataset_query}
                            />
                        :
                            <div className="wrapper">
                                <GuiQueryEditor
                                    {...this.props}
                                    datasetQuery={card && card.dataset_query}
                                />
                            </div>
                        }
                    </div>

                    <div ref="viz" id="react_qb_viz" className="flex z1" style={{ "transition": "opacity 0.25s ease-in-out" }}>
                        <QueryVisualization {...this.props} className="full wrapper mb2 z1" />
                    </div>

                    { ModeFooter &&
                        <ModeFooter {...this.props} className="flex-no-shrink" />
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

                { uiControls.isShowingTutorial &&
                    <QueryBuilderTutorial onClose={() => this.props.closeQbTutorial()} />
                }

                { uiControls.isShowingNewbModal &&
                    <SavedQuestionIntroModal onClose={() => this.props.closeQbNewbModal()} />
                }

                <ActionsWidget {...this.props} className="z2 absolute bottom right" />
            </div>
        );
    }
}

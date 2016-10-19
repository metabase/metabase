import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import cx from "classnames";
import _ from "underscore";

import { AngularResourceProxy } from "metabase/lib/redux";
import { loadTableAndForeignKeys } from "metabase/lib/table";
import { isPK, isFK } from "metabase/lib/types";

import NotFound from "metabase/components/NotFound.jsx";
import QueryHeader from "../QueryHeader.jsx";
import GuiQueryEditor from "../GuiQueryEditor.jsx";
import NativeQueryEditor from "../NativeQueryEditor.jsx";
import QueryVisualization from "../QueryVisualization.jsx";
import DataReference from "../dataref/DataReference.jsx";
import TagEditorSidebar from "../template_tags/TagEditorSidebar.jsx";
import QueryBuilderTutorial from "../../tutorial/QueryBuilderTutorial.jsx";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal.jsx";


import {
    card,
    originalCard,
    databases,
    queryResult,
    parameterValues,
    isDirty,
    isNew,
    isObjectDetail,
    tables,
    tableMetadata,
    tableForeignKeys,
    tableForeignKeyReferences,
    uiControls,
    getParameters,
    getDatabaseFields,
    getSampleDatasetId,
    getFullDatasetQuery,
    getNativeDatabases,
} from "../selectors";

import * as actions from "../actions";
import { push } from "react-router-redux";

const cardApi = new AngularResourceProxy("Card", ["create", "update", "delete"]);
const dashboardApi = new AngularResourceProxy("Dashboard", ["list", "create"]);
const revisionApi = new AngularResourceProxy("Revision", ["list", "revert"]);
const Metabase = new AngularResourceProxy("Metabase", ["db_autocomplete_suggestions"]);

function cellIsClickable(queryResult, rowIndex, columnIndex) {
    if (!queryResult) return false;

    // lookup the coldef and cell value of the cell we are curious about
    var coldef = queryResult.data.cols[columnIndex];

    if (!coldef || !coldef.special_type) return false;

    return (coldef.table_id != null && (isPK(coldef.special_type) || (isFK(coldef.special_type) && coldef.target)));
}

function autocompleteResults(card, prefix) {
    let databaseId = card && card.dataset_query && card.dataset_query.database;
    let apiCall = Metabase.db_autocomplete_suggestions({
       dbId: databaseId,
       prefix: prefix
    });
    return apiCall;
}

const mapStateToProps = (state, props) => {
    return {
        user:                      state.currentUser,
        fromUrl:                   props.location.query.from,
        location:                  props.location,

        card:                      card(state),
        originalCard:              originalCard(state),
        query:                     state.qb.card && state.qb.card.dataset_query,  // TODO: EOL, redundant
        parameterValues:           parameterValues(state),
        databases:                 databases(state),
        nativeDatabases:           getNativeDatabases(state),
        tables:                    tables(state),
        tableMetadata:             tableMetadata(state),
        tableForeignKeys:          tableForeignKeys(state),
        tableForeignKeyReferences: tableForeignKeyReferences(state),
        result:                    queryResult(state),
        isDirty:                   isDirty(state),
        isNew:                     isNew(state),
        isObjectDetail:            isObjectDetail(state),
        uiControls:                uiControls(state),
        parameters:                getParameters(state),
        databaseFields:            getDatabaseFields(state),
        sampleDatasetId:           getSampleDatasetId(state),
        fullDatasetQuery:          getFullDatasetQuery(state),

        isShowingDataReference:    state.qb.uiControls.isShowingDataReference,
        isShowingTutorial:         state.qb.uiControls.isShowingTutorial,
        isEditing:                 state.qb.uiControls.isEditing,
        isRunning:                 state.qb.uiControls.isRunning,
        cardApi:                   cardApi,
        dashboardApi:              dashboardApi,
        revisionApi:               revisionApi,
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
export default class QueryBuilder extends Component {

    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "handleResize");

        // TODO: React tells us that forceUpdate() is not the best thing to use, so ideally we can find a different way to trigger this
        this.forceUpdateDebounced = _.debounce(this.forceUpdate.bind(this), 400);
    }

    componentWillMount() {
        this.props.initializeQB(this.props.location, this.props.params);
    }

    componentDidMount() {
        window.addEventListener('resize', this.handleResize);
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
        } else if (this.props.location.query.tutorial === undefined && nextProps.location.query.tutorial !== undefined) {
            this.props.initializeQB(nextProps.location, nextProps.params);
        } else if (getURL(nextProps.location) === "/q" && getURL(this.props.location) !== "/q") {
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
        window.removeEventListener('resize', this.handleResize);
    }

    // When the window is resized we need to re-render, mainly so that our visualization pane updates
    // Debounce the function to improve resizing performance.
    handleResize(e) {
        this.forceUpdateDebounced();
        let viz = ReactDOM.findDOMNode(this.refs.viz);
        if (viz) {
            viz.style.opacity = 0.2;
        }
    }

    render() {
        const { card, isDirty, databases, uiControls } = this.props;

        // if we can't load the card that was intended then we end up with a 404
        // TODO: we should do something more unique for is500
        if (uiControls.is404 || uiControls.is500) {
            return (
                <div className="flex flex-column flex-full layout-centered">
                    <NotFound />
                </div>
            );
        }

        // if we don't have a card at all or no databases then we are initializing, so keep it simple
        if (!card || !databases) {
            return (
                <div></div>
            );
        }

        const showDrawer = uiControls.isShowingDataReference || uiControls.isShowingTemplateTagsEditor;
        return (
            <div className="flex-full relative">
                <div className={cx("QueryBuilder flex flex-column bg-white spread", {"QueryBuilder--showSideDrawer": showDrawer})}>
                    <div id="react_qb_header">
                        <QueryHeader {...this.props}/>
                    </div>

                    <div id="react_qb_editor" className="z2">
                        { card && card.dataset_query && card.dataset_query.type === "native" ?
                            <NativeQueryEditor {...this.props} isOpen={!card.dataset_query.native.query || isDirty} />
                        :
                            <div className="wrapper"><GuiQueryEditor {...this.props}/></div>
                        }
                    </div>

                    <div ref="viz" id="react_qb_viz" className="flex z1" style={{ "transition": "opacity 0.25s ease-in-out" }}>
                        <QueryVisualization {...this.props}/>
                    </div>
                </div>

                <div className={cx("SideDrawer", { "SideDrawer--show": showDrawer })}>
                    { uiControls.isShowingDataReference &&
                        <DataReference {...this.props} closeFn={() => this.props.toggleDataReference()} />
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
            </div>
        );
    }
}

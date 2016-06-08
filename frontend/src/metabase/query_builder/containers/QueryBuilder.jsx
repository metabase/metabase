import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import cx from "classnames";
import _ from "underscore";

import { AngularResourceProxy } from "metabase/lib/redux";
import { loadTable } from "metabase/lib/table";

import NotFound from "metabase/components/NotFound.jsx";
import QueryHeader from "../QueryHeader.jsx";
import GuiQueryEditor from "../GuiQueryEditor.jsx";
import NativeQueryEditor from "../NativeQueryEditor.jsx";
import QueryVisualization from "../QueryVisualization.jsx";
import DataReference from "../dataref/DataReference.jsx";
import QueryBuilderTutorial from "../../tutorial/QueryBuilderTutorial.jsx";
import SavedQuestionIntroModal from "../SavedQuestionIntroModal.jsx";


import { 
    card,
    originalCard,
    databases,
    queryResult,
    isDirty,
    isObjectDetail,
    tables,
    tableMetadata,
    tableForeignKeys,
    tableForeignKeyReferences,
    uiControls,
} from "../selectors";

import * as actions from "../actions";


const cardApi = new AngularResourceProxy("Card", ["create", "update", "delete"]);
const dashboardApi = new AngularResourceProxy("Dashboard", ["list", "create"]);
const revisionApi = new AngularResourceProxy("Revision", ["list", "revert"]);
const Metabase = new AngularResourceProxy("Metabase", ["db_autocomplete_suggestions"]);

function cellIsClickable(queryResult, rowIndex, columnIndex) {
    if (!queryResult) return false;

    // lookup the coldef and cell value of the cell we are curious about
    var coldef = queryResult.data.cols[columnIndex];

    if (!coldef || !coldef.special_type) return false;

    if (coldef.table_id != null && coldef.special_type === 'id' || (coldef.special_type === 'fk' && coldef.target)) {
        return true;
    } else {
        return false;
    }
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
        card:                      card(state),
        originalCard:              originalCard(state),
        query:                     state.card && state.card.dataset_query,  // TODO: EOL, redundant
        databases:                 databases(state),
        tables:                    tables(state),
        tableMetadata:             tableMetadata(state),
        tableForeignKeys:          tableForeignKeys(state),
        tableForeignKeyReferences: tableForeignKeyReferences(state),
        result:                    queryResult(state),
        isDirty:                   isDirty(state),
        isObjectDetail:            isObjectDetail(state),
        uiControls:                uiControls(state),

        cardIsDirtyFn:             () => isDirty(state),
        cardIsNewFn:               () => (state.card && !state.card.id),
        isShowingDataReference:    state.uiControls.isShowingDataReference,
        isShowingTutorial:         state.uiControls.isShowingTutorial,
        isEditing:                 state.uiControls.isEditing,
        isRunning:                 state.uiControls.isRunning,
        cardApi:                   cardApi,
        dashboardApi:              dashboardApi,
        revisionApi:               revisionApi,
        loadTableFn:               loadTable,
        autocompleteResultsFn:     (prefix) => autocompleteResults(state.card, prefix),
        cellIsClickableFn:         (rowIndex, columnIndex) => cellIsClickable(state.queryResult, rowIndex, columnIndex)
    }
}
            

const mapDispatchToProps = {
    ...actions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class QueryBuilder extends Component {

    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "popStateListener", "handleResize");
    }

    componentWillMount() {
        this.props.initializeQB();
    }

    componentDidMount() {
        window.addEventListener('popstate', this.popStateListener);
        window.addEventListener('resize', this.handleResize);
    }

    componentWillUnmount() {
        window.removeEventListener('popstate', this.popStateListener);
        window.removeEventListener('resize', this.handleResize);
    }

    // When the window is resized we need to re-render, mainly so that our visualization pane updates
    // Debounce the function to improve resizing performance.
    handleResize(e) {
        _.debounce(() => this.setState(this.state), 400);
    }

    popStateListener(e) {
        if (e.state && e.state.card) {
            e.preventDefault();
            this.props.setCardAndRun(e.state.card);
        }
    }

    render() {
        const { card, cardIsDirtyFn, databases, uiControls } = this.props;

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

        return (
            <div>
                <div className={cx("QueryBuilder flex flex-column bg-white spread", {"QueryBuilder--showDataReference": uiControls.isShowingDataReference})}>
                    <div id="react_qb_header">
                        <QueryHeader {...this.props}/>
                    </div>

                    <div id="react_qb_editor" className="z2">
                        { card && card.dataset_query && card.dataset_query.type === "native" ?
                            <NativeQueryEditor {...this.props} isOpen={!card.dataset_query.native.query || cardIsDirtyFn()} />
                        :
                            <div className="wrapper"><GuiQueryEditor {...this.props}/></div>
                        }
                    </div>

                    <div id="react_qb_viz" className="flex z1">
                        <QueryVisualization {...this.props}/>
                    </div>
                </div>

                <div className="DataReference" id="react_data_reference">
                    <DataReference {...this.props} closeFn={() => this.props.toggleDataReference()} />
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
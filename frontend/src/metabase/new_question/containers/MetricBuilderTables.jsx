import React, { Component } from "react";
import { connect } from "react-redux";

import { currentStepTitle, getTablesForFlow } from "../selectors";
import { selectAndAdvance, setTable } from "../actions";

import ResponsiveList from "metabase/components/ResponsiveList";

const mapStateToProps = state => ({
    title: currentStepTitle(state),
    tables: getTablesForFlow(state)
});

const mapDispatchToProps = {
    selectAndAdvance,
    setTable
};

@connect(mapStateToProps, mapDispatchToProps)
class MetricBuilderTables extends Component {
    state = {
        search: ""
    };
    render() {
        const { title, tables, selectAndAdvance, setTable } = this.props;
        return (
            <ResponsiveList
                items={tables}
                onClick={table => selectAndAdvance(() => setTable(table.id))}
            />
        );
    }
}

/*
<div className="bg-white bordered rounded mt2">
    <ol>
        {tables
                .filter(table =>
                    table.name.toLowerCase().includes(this.state.search.toLowerCase())
                )
                .map(({ id, display_name }) => (
                <li
                    key={id}
                    className="border-bottom p2"
                >
                    <a
                        className="link"
                        onClick={() =>
                            selectAndAdvance(() => setTable(id))}
                    >
                        <h3>{display_name}</h3>
                    </a>
                </li>
            ))}
    </ol>
*/

export default MetricBuilderTables;

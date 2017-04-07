import React, { Component } from "react";
import { connect } from "react-redux";

import { currentStepTitle, getTablesForFlow } from "../selectors";

import { selectAndAdvance, setTable } from "../actions";

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
        search: ''
    }
    render() {
        const { title, tables, selectAndAdvance, setTable } = this.props;
        return (
            <div>
                <h3>{title}</h3>
                <div className="bg-white bordered rounded mt2">
                    <div className="border-bottom">
                        <input
                            className="borderless p2 h3 full"
                            placeholder="Search for a table"
                            type="text"
                            onChange={(ev) => this.setState({ search: ev.target.value })}
                            autoFocus
                        />
                    </div>
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
                </div>
            </div>
        );
    }
}

export default MetricBuilderTables;

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
    render() {
        const { title, tables, selectAndAdvance, setTable } = this.props;
        return (
            <div>
                <h3>{title}</h3>
                <ol>
                    {tables.map(({ id, name }) => (
                        <li key={id}>
                            <a
                                className="link"
                                onClick={() =>
                                    selectAndAdvance(() => setTable(id))}
                            >
                                {name}
                            </a>
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
}

export default MetricBuilderTables;

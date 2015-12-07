import React, { Component, PropTypes } from "react";

import AggregationItem from "./AggregationItem.jsx";

export default class AggregationsList extends Component {
    static propTypes = {};

    render() {
        let { table } = this.props;

        table.aggregations = [
            { id: "1", name: "Average Customer Age", formula: "Average of Age, Filtered by Customers" }
        ];

        return (
            <div className="mb4">
                <div className="flex mb1">
                    <h2 className="px1 text-green">Aggregations</h2>
                    <a className="flex-align-right float-right text-bold text-brand no-decoration" href={"/admin/datamodel/aggregation/create?table="+table.id}>+ Add an Aggregations</a>
                </div>
                <table className="AdminTable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th className="full">Formula</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table.aggregations.map(aggregation =>
                            <AggregationItem
                                key={aggregation.id}
                                aggregation={aggregation}
                            />
                        )}
                    </tbody>
                </table>
            </div>
        );
    }
}

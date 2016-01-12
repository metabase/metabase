import React, { Component, PropTypes } from "react";

import MetricItem from "./MetricItem.jsx";

export default class MetricsList extends Component {
    static propTypes = {
        tableMetadata: PropTypes.object.isRequired,
        onRetire: PropTypes.func.isRequired
    };

    render() {
        let { tableMetadata } = this.props;

        tableMetadata.metrics = tableMetadata.metrics || [];
        tableMetadata.metrics = tableMetadata.metrics.filter((mtrc) => mtrc.is_active === true);

        return (
            <div className="my3">
                <div className="flex mb1">
                    <h2 className="px1 text-green">Metrics</h2>
                    <a className="flex-align-right float-right text-bold text-brand no-decoration" href={"/admin/datamodel/metric/create?table="+tableMetadata.id}>+ Add a Metric</a>
                </div>
                <table className="AdminTable">
                    <thead>
                        <tr>
                            <th style={{ minWidth: "200px" }}>Name</th>
                            <th className="full">Definition</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableMetadata.metrics.map(metric =>
                            <MetricItem
                                key={metric.id}
                                metric={metric}
                                tableMetadata={tableMetadata}
                                onRetire={this.props.onRetire}
                            />
                        )}
                    </tbody>
                </table>
                { tableMetadata.metrics.length === 0 &&
                    <div className="flex layout-centered m4 text-grey-3">
                        Create metrics to add them to the View dropdown in the query builder
                    </div>
                }
            </div>
        );
    }
}

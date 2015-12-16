import React, { Component, PropTypes } from "react";

import MetricForm from "./MetricForm.jsx";

import { metricEditSelectors } from "../selectors";
import * as actions from "../actions";

import { connect } from "react-redux";

@connect(metricEditSelectors, actions)
export default class MetricApp extends Component {
    async componentWillMount() {
        const { params, location } = this.props;

        let tableId;
        if (params.id) {
            const metricId = parseInt(params.id);
            const { payload: metric } = await this.props.getMetric({ metricId });
            tableId = metric.table_id;
        } else if (location.query.table) {
            tableId = parseInt(location.query.table);
        }

        if (tableId != null) {
            this.props.loadTableMetadata(tableId);
        }
    }

    async onSubmit(metric, f) {
        let { tableMetadata } = this.props;
        if (metric.id != null) {
            await this.props.updateMetric(metric);
        } else {
            await this.props.createMetric(metric);
        }

        this.onLocationChange("/admin/datamodel/database/" + tableMetadata.db_id + "/table/" + tableMetadata.id);
    }

    render() {
        return (
            <div>
                <MetricForm
                    {...this.props}
                    onSubmit={this.onSubmit.bind(this)}
                />
            </div>
        );
    }

    // HACK: figure out a better way to do this that works with both redux-router and Angular's router
    onLocationChange(path) {
        const el = angular.element(document.querySelector("body"));
        el.scope().$apply(function() {
            el.injector().get("$location").path(path);
        });
    }
}

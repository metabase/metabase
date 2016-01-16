import React, { Component, PropTypes } from "react";

import SegmentForm from "./SegmentForm.jsx";

import { segmentEditSelectors } from "../selectors";
import * as actions from "../actions";

import { connect } from "react-redux";

@connect(segmentEditSelectors, actions)
export default class SegmentApp extends Component {
    async componentWillMount() {
        const { params, location } = this.props;

        let tableId;
        if (params.id) {
            const segmentId = parseInt(params.id);
            const { payload: segment } = await this.props.getSegment({ segmentId });
            tableId = segment.table_id;
        } else if (location.query.table) {
            tableId = parseInt(location.query.table);
        }

        if (tableId != null) {
            this.props.loadTableMetadata(tableId);
        }
    }

    async onSubmit(segment, f) {
        let { tableMetadata } = this.props;
        if (segment.id != null) {
            await this.props.updateSegment(segment);
        } else {
            await this.props.createSegment(segment);
        }

        this.onLocationChange("/admin/datamodel/database/" + tableMetadata.db_id + "/table/" + tableMetadata.id);
    }

    render() {
        return (
            <div>
                <SegmentForm
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

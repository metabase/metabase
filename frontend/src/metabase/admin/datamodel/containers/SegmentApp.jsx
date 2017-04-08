import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import SegmentForm from "./SegmentForm.jsx";

import { segmentEditSelectors } from "../selectors";
import * as actions from "../datamodel";
import { clearRequestState } from "metabase/redux/requests";

const mapDispatchToProps = {
    ...actions,
    clearRequestState,
    onChangeLocation: push
};

@connect(segmentEditSelectors, mapDispatchToProps)
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
            this.props.clearRequestState({statePath: ['metadata', 'segments']});
            MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
        } else {
            await this.props.createSegment(segment);
            this.props.clearRequestState({statePath: ['metadata', 'segments']});
            MetabaseAnalytics.trackEvent("Data Model", "Segment Created");
        }

        this.props.onChangeLocation("/admin/datamodel/database/" + tableMetadata.db_id + "/table/" + tableMetadata.id);
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
}

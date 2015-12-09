import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import { segmentEditSelectors } from "../selectors";
import * as actions from "../actions";

import SegmentForm from "./SegmentForm.jsx";

@connect(segmentEditSelectors, actions)
export default class SegmentApp extends Component {
    async componentDidMount() {
        let { tableId, segmentId } = this.props;

        if (segmentId) {
            this.props.setCurrentSegmentId(segmentId);
            let { payload: segment } = await this.props.getSegment({ segmentId });
            tableId = segment.table_id;
        } else if (tableId) {
            this.props.setCurrentSegmentId(null);
            this.props.newSegment({ id: null, table_id: tableId, definition: { filter: [] } });
        }

        if (tableId) {
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

import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import SegmentForm from "./SegmentForm.jsx";

import { segmentEditSelectors } from "../selectors";
import * as actions from "../datamodel";
import { clearRequestState } from "metabase/redux/requests";
import { getMetadata } from "metabase/selectors/metadata";
import { fetchTableMetadata } from "metabase/redux/metadata";

const mapDispatchToProps = {
  ...actions,
  fetchTableMetadata,
  clearRequestState,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  ...segmentEditSelectors(state, props),
  metadata: getMetadata(state, props),
});

@connect(mapStateToProps, mapDispatchToProps)
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
      // TODO Atte Keinänen 6/8/17: Use only global metadata (`fetchTableMetadata`)
      this.props.loadTableMetadata(tableId);
      this.props.fetchTableMetadata(tableId);
    }
  }

  async onSubmit(segment, f) {
    let { tableMetadata } = this.props;
    if (segment.id != null) {
      await this.props.updateSegment(segment);
      this.props.clearRequestState({ statePath: ["entities", "segments"] });
      MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
    } else {
      await this.props.createSegment(segment);
      this.props.clearRequestState({ statePath: ["entities", "segments"] });
      MetabaseAnalytics.trackEvent("Data Model", "Segment Created");
    }

    this.props.onChangeLocation(
      "/admin/datamodel/database/" +
        tableMetadata.db_id +
        "/table/" +
        tableMetadata.id,
    );
  }

  render() {
    return (
      <div>
        <SegmentForm {...this.props} onSubmit={this.onSubmit.bind(this)} />
      </div>
    );
  }
}

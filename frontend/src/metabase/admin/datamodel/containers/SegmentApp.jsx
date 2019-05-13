import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import SegmentForm from "./SegmentForm.jsx";

// import { segmentEditSelectors } from "../selectors";
import * as actions from "../datamodel";
// import { clearRequestState } from "metabase/redux/requests";
import { getMetadata } from "metabase/selectors/metadata";
// import { fetchTableMetadata } from "metabase/redux/metadata";
import Segments from "metabase/entities/segments";
import Tables from "metabase/entities/tables";

const mapDispatchToProps = {
  ...actions,
  // fetchTableMetadata,
  // clearRequestState,
  createSegment: Segments.actions.create,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  // ...segmentEditSelectors(state, props),
  metadata: getMetadata(state, props),
});

@Segments.load({
  id: (state, props) => parseInt(props.params.id),
  wrapped: true,
})
@Tables.load({ id: (state, props) => props.segment.table_id, wrapped: true })
class UpdateSegmentForm extends Component {
  constructor() {
    super();
    this.onSubmit = this.onSubmit.bind(this);
  }

  async onSubmit(segment) {
    await this.props.segment.update(segment);
    MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
    const { id: tableId, db_id: databaseId } = this.props.table;
    this.props.onChangeLocation(
      `/admin/datamodel/database/${databaseId}/table/${tableId}`,
    );
  }

  render() {
    if (this.props.table) {
      this.props.table.fetchTableMetadata();
    }
    return <SegmentForm {...this.props} onSubmit={this.onSubmit} />;
  }
}

@Tables.load({
  id: (state, props) => parseInt(props.location.query.table),
  wrapped: true,
})
class CreateSegmentForm extends Component {
  constructor() {
    super();
    this.onSubmit = this.onSubmit.bind(this);
  }

  async onSubmit(segment) {
    const { id: tableId, db_id: databaseId } = this.props.table;
    await this.props.createSegment({ ...segment, table_id: tableId });
    MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
    this.props.onChangeLocation(
      `/admin/datamodel/database/${databaseId}/table/${tableId}`,
    );
  }

  render() {
    if (this.props.table) {
      this.props.table.fetchTableMetadata();
    }
    return <SegmentForm {...this.props} onSubmit={this.onSubmit} />;
  }
}

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class SegmentApp extends Component {
  render() {
    return this.props.params.id ? (
      <UpdateSegmentForm {...this.props} />
    ) : (
      <CreateSegmentForm {...this.props} />
    );
  }
}

import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import SegmentForm from "./SegmentForm";

import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";
import withTableMetadataLoaded from "../hoc/withTableMetadataLoaded";
import { getMetadata } from "metabase/selectors/metadata";
import Segments from "metabase/entities/segments";
import Tables from "metabase/entities/tables";

const mapDispatchToProps = {
  updatePreviewSummary,
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state, props),
  previewSummary: getPreviewSummary(state),
});

@Segments.load({ id: (state, props) => parseInt(props.params.id) })
@Tables.load({ id: (state, props) => props.segment.table_id, wrapped: true })
@withTableMetadataLoaded
class UpdateSegmentForm extends Component {
  onSubmit = async segment => {
    await this.props.updateSegment(segment);
    MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
    const tableId = this.props.table.id;
    this.props.onChangeLocation(`/admin/datamodel/segments?table=${tableId}`);
  };

  render() {
    const { segment, ...props } = this.props;
    return (
      <SegmentForm
        {...props}
        segment={segment.getPlainObject()}
        onSubmit={this.onSubmit}
      />
    );
  }
}

@Tables.load({
  id: (state, props) => parseInt(props.location.query.table),
  wrapped: true,
})
@withTableMetadataLoaded
class CreateSegmentForm extends Component {
  onSubmit = async segment => {
    const tableId = this.props.table.id;
    await this.props.createSegment({ ...segment, table_id: tableId });
    MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
    this.props.onChangeLocation(`/admin/datamodel/segments?table=${tableId}`);
  };

  render() {
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

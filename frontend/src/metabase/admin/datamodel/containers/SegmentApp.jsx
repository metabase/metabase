import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import Segments from "metabase/entities/segments";

import { updatePreviewSummary } from "../datamodel";
import { getPreviewSummary } from "../selectors";
import SegmentForm from "../components/SegmentForm";

const mapDispatchToProps = {
  updatePreviewSummary,
  createSegment: Segments.actions.create,
  updateSegment: Segments.actions.update,
  onChangeLocation: push,
};

const mapStateToProps = (state, props) => ({
  previewSummary: getPreviewSummary(state),
});

@Segments.load({ id: (state, props) => parseInt(props.params.id) })
class UpdateSegmentForm extends Component {
  onSubmit = async segment => {
    await this.props.updateSegment(segment);
    MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
    this.props.onChangeLocation(`/admin/datamodel/segments`);
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

class CreateSegmentForm extends Component {
  onSubmit = async segment => {
    await this.props.createSegment({
      ...segment,
      table_id: segment.definition["source-table"],
    });
    MetabaseAnalytics.trackEvent("Data Model", "Segment Updated");
    this.props.onChangeLocation(`/admin/datamodel/segments`);
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

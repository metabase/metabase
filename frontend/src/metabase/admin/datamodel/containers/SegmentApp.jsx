/* eslint-disable react/prop-types */
import { Component, useCallback } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import * as MetabaseAnalytics from "metabase/lib/analytics";
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

class UpdateSegmentFormInner extends Component {
  onSubmit = async segment => {
    await this.props.updateSegment(segment);
    MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");
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

const UpdateSegmentForm = Segments.load({
  id: (state, props) => parseInt(props.params.id),
})(UpdateSegmentFormInner);

const CreateSegmentForm = props => {
  const { createSegment, onChangeLocation } = props;

  const handleSubmit = useCallback(
    async segment => {
      await createSegment({
        ...segment,
        table_id: segment.definition["source-table"],
      });
      MetabaseAnalytics.trackStructEvent("Data Model", "Segment Updated");
      onChangeLocation(`/admin/datamodel/segments`);
    },
    [createSegment, onChangeLocation],
  );

  return <SegmentForm {...props} onSubmit={handleSubmit} />;
};

class SegmentApp extends Component {
  render() {
    return this.props.params.id ? (
      <UpdateSegmentForm {...this.props} />
    ) : (
      <CreateSegmentForm {...this.props} />
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(SegmentApp);

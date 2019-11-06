import React, { Component } from "react";
import { connect } from "react-redux";

import RevisionHistory from "../components/revisions/RevisionHistory";
import Metrics from "metabase/entities/metrics";
import Segments from "metabase/entities/segments";

import { getRevisions, getCurrentUser } from "../selectors";
import { fetchRevisions } from "../datamodel";

const mapStateToProps = (state, props) => ({
  objectType: props.params.entity,
  id: props.params.id,
  user: getCurrentUser(state),
  revisions: getRevisions(state),
});

const mapDispatchToProps = { fetchRevisions };

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class RevisionHistoryApp extends Component {
  componentWillMount() {
    const { id, objectType } = this.props;
    this.props.fetchRevisions({ entity: objectType, id });
  }

  render() {
    return this.props.objectType === "metric" ? (
      <MetricRevisionHistory {...this.props} />
    ) : (
      <SegmentRevisionHistory {...this.props} />
    );
  }
}

@Metrics.load({ id: (state, { id }) => id })
class MetricRevisionHistory extends Component {
  render() {
    const { metric, ...props } = this.props;
    return <RevisionHistory object={metric} {...props} />;
  }
}

@Segments.load({ id: (state, { id }) => id })
class SegmentRevisionHistory extends Component {
  render() {
    const { segment, ...props } = this.props;
    return <RevisionHistory object={segment} {...props} />;
  }
}

/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import Metrics from "metabase/entities/metrics";
import Segments from "metabase/entities/segments";

import RevisionHistory from "../components/revisions/RevisionHistory";
import { fetchRevisions } from "../datamodel";
import { getRevisions, getCurrentUser } from "../selectors";

const mapStateToProps = (state, props) => ({
  objectType: props.params.entity,
  id: props.params.id,
  user: getCurrentUser(state),
  revisions: getRevisions(state),
});

const mapDispatchToProps = { fetchRevisions };

class RevisionHistoryApp extends Component {
  componentDidMount() {
    const { id, objectType } = this.props;
    this.props.fetchRevisions({
      entity: objectType === "metric" ? "legacy-metric" : objectType,
      id,
    });
  }

  render() {
    return this.props.objectType === "metric" ? (
      <MetricRevisionHistory {...this.props} />
    ) : (
      <SegmentRevisionHistory {...this.props} />
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(RevisionHistoryApp);

class MetricRevisionHistoryInner extends Component {
  render() {
    const { metric, ...props } = this.props;
    return <RevisionHistory object={metric} {...props} />;
  }
}

const MetricRevisionHistory = Metrics.load({ id: (state, { id }) => id })(
  MetricRevisionHistoryInner,
);

class SegmentRevisionHistoryInner extends Component {
  render() {
    const { segment, ...props } = this.props;
    return <RevisionHistory object={segment} {...props} />;
  }
}

const SegmentRevisionHistory = Segments.load({ id: (state, { id }) => id })(
  SegmentRevisionHistoryInner,
);

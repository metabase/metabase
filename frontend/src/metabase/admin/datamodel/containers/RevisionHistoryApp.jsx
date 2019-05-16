import React, { Component } from "react";
import { connect } from "react-redux";

import RevisionHistory from "../components/revisions/RevisionHistory.jsx";
import Metrics from "metabase/entities/metrics";
import Segments from "metabase/entities/segments";

import { getRevisions, getCurrentUser } from "../selectors";
import { fetchRevisions } from "../datamodel";

const mapStateToProps = (state, props) => ({
  entityName: props.params.entity,
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
  render() {
    return this.props.entityName == "metric" ? (
      <MetricRevisionHistory {...this.props} />
    ) : (
      <SegmentRevisionHistory {...this.props} />
    );
  }
}

@Metrics.load({ id: (state, { id }) => id })
class MetricRevisionHistory extends Component {
  componentWillMount() {
    const { metric } = this.props;
    if (metric) {
      this.props.fetchRevisions({ entity: "metric", id: metric.id });
    }
  }

  componentDidUpdate({ metric: { id: prevId } }) {
    const { id } = this.props.metric;
    if (id !== prevId) {
      this.props.fetchRevisions({ entity: "metric", id });
    }
  }

  render() {
    const { metric, ...props } = this.props;
    return (
      <RevisionHistory
        {...props}
        object={metric}
        objectType={this.props.entity}
      />
    );
  }
}

@Segments.load({ id: (state, { id }) => id })
class SegmentRevisionHistory extends Component {
  componentWillMount() {
    const { segment } = this.props;
    if (segment) {
      this.props.fetchRevisions({ entity: "segment", id: segment.id });
    }
  }

  componentDidUpdate({ segment: { id: prevId } }) {
    const { id } = this.props.segment;
    if (id !== prevId) {
      this.props.fetchRevisions({ entity: "segment", id });
    }
  }

  render() {
    const { segment, ...props } = this.props;
    return (
      <RevisionHistory
        {...props}
        object={segment}
        objectType={this.props.entityName}
      />
    );
  }
}

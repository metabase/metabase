/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import Segments from "metabase/entities/segments";

import RevisionHistory from "../components/revisions/RevisionHistory";
import { fetchRevisions } from "../datamodel";
import { getRevisions, getCurrentUser } from "../selectors";

const mapStateToProps = (state, props) => ({
  id: props.params.id,
  user: getCurrentUser(state),
  revisions: getRevisions(state),
});

const mapDispatchToProps = { fetchRevisions };

class RevisionHistoryApp extends Component {
  componentDidMount() {
    const { id } = this.props;
    this.props.fetchRevisions({
      entity: "segment",
      id,
    });
  }

  render() {
    return <SegmentRevisionHistory {...this.props} />;
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(RevisionHistoryApp);

class SegmentRevisionHistoryInner extends Component {
  render() {
    const { segment, ...props } = this.props;
    return <RevisionHistory object={segment} {...props} />;
  }
}

const SegmentRevisionHistory = Segments.load({ id: (state, { id }) => id })(
  SegmentRevisionHistoryInner,
);

/* eslint-disable react/prop-types */
import { Component } from "react";
import _ from "underscore";

import { Segments } from "metabase/entities/segments";
import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";

import { RevisionHistory } from "../components/revisions/RevisionHistory";
import { fetchSegmentRevisions } from "../datamodel";
import { getCurrentUser, getRevisions } from "../selectors";

const mapStateToProps = (state, props) => ({
  id: props.params.id,
  user: getCurrentUser(state),
  revisions: getRevisions(state),
});

const mapDispatchToProps = { fetchSegmentRevisions };

class RevisionHistoryAppInner extends Component {
  componentDidMount() {
    const { id } = this.props;
    this.props.fetchSegmentRevisions(id);
  }

  render() {
    return <SegmentRevisionHistory {...this.props} />;
  }
}

export const RevisionHistoryApp = connect(
  mapStateToProps,
  mapDispatchToProps,
)(RevisionHistoryAppInner);

class SegmentRevisionHistoryInner extends Component {
  render() {
    const { segment, ...props } = this.props;
    return <RevisionHistory segment={segment} {...props} />;
  }
}

const SegmentRevisionHistory = _.compose(
  Segments.load({ id: (_state, { id }) => id }),
  Tables.load({
    id: (_state, { segment }) => segment?.table_id,
    fetchType: "fetchMetadataAndForeignTables",
    requestType: "fetchMetadataDeprecated",
  }),
)(SegmentRevisionHistoryInner);

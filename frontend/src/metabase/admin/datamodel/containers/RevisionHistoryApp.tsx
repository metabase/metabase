import { Component } from "react";
import _ from "underscore";

import { Segments } from "metabase/entities/segments";
import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { RevisionHistory } from "../components/revisions/RevisionHistory";
import { fetchSegmentRevisions } from "../datamodel";
import { getCurrentUser, getRevisions } from "../selectors";

interface OwnProps {
  params: { id: string };
}

interface StateProps {
  id: string;
  user: User;
  revisions: any[];
}

interface DispatchProps {
  fetchSegmentRevisions: typeof fetchSegmentRevisions;
}

type RevisionHistoryAppInnerProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State, props: OwnProps): StateProps => ({
  id: props.params.id,
  user: getCurrentUser(state),
  revisions: getRevisions(state),
});

const mapDispatchToProps: DispatchProps = { fetchSegmentRevisions };

class RevisionHistoryAppInner extends Component<RevisionHistoryAppInnerProps> {
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

interface SegmentRevisionHistoryInnerProps {
  segment: any;
  [key: string]: any;
}

class SegmentRevisionHistoryInner extends Component<SegmentRevisionHistoryInnerProps> {
  render() {
    const { segment, ...props } = this.props;
    return <RevisionHistory segment={segment} {...props} />;
  }
}

const SegmentRevisionHistory = _.compose(
  Segments.load({ id: (_state: State, { id }: { id: string }) => id }),
  Tables.load({
    id: (_state: State, { segment }: { segment?: any }) => segment?.table_id,
    fetchType: "fetchMetadataAndForeignTables",
    requestType: "fetchMetadataDeprecated",
  }),
)(SegmentRevisionHistoryInner);

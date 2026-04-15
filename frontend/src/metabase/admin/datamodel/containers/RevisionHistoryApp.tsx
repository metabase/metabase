import { useEffect } from "react";
import _ from "underscore";

import { Segments } from "metabase/entities/segments";
import { Tables } from "metabase/entities/tables";
import type { State } from "metabase/redux/store";
import { getUser } from "metabase/selectors/user";
import { connect } from "metabase/utils/redux";
import { checkNotNull } from "metabase/utils/types";
import type { Revision, RevisionId, Segment, User } from "metabase-types/api";

import { RevisionHistory } from "../components/revisions/RevisionHistory";
import { fetchSegmentRevisions } from "../datamodel";
import { getRevisions } from "../selectors";

type RevisionHistoryAppOwnProps = {
  params: {
    id: string;
  };
};

type RevisionHistoryAppStateProps = {
  id: string;
  revisions: Revision[] | null;
  user: User;
};

type RevisionHistoryAppDispatchProps = {
  fetchSegmentRevisions: (id: RevisionId | string) => void;
};

type RevisionHistoryAppInnerProps = RevisionHistoryAppOwnProps &
  RevisionHistoryAppStateProps &
  RevisionHistoryAppDispatchProps;

const mapStateToProps = (
  state: State,
  props: RevisionHistoryAppOwnProps,
): RevisionHistoryAppStateProps => ({
  id: props.params.id,
  revisions: getRevisions(state),
  user: checkNotNull(getUser(state)),
});

const mapDispatchToProps: RevisionHistoryAppDispatchProps = {
  fetchSegmentRevisions,
};

function RevisionHistoryAppInner({
  id,
  user,
  revisions,
  fetchSegmentRevisions,
  ...props
}: RevisionHistoryAppInnerProps) {
  useEffect(() => {
    fetchSegmentRevisions(id);
  }, [id, fetchSegmentRevisions]);

  return (
    <SegmentRevisionHistory
      {...props}
      id={id}
      user={user}
      revisions={revisions}
      fetchSegmentRevisions={fetchSegmentRevisions}
    />
  );
}

export const RevisionHistoryApp = connect(
  mapStateToProps,
  mapDispatchToProps,
)(RevisionHistoryAppInner);

type SegmentRevisionHistoryInnerProps = RevisionHistoryAppStateProps &
  RevisionHistoryAppDispatchProps & {
    segment: Segment;
  };

function SegmentRevisionHistoryInner({
  segment,
  ...props
}: SegmentRevisionHistoryInnerProps) {
  return <RevisionHistory segment={segment} {...props} />;
}

const SegmentRevisionHistory = _.compose(
  Segments.load({ id: (_state: State, { id }: { id: string }) => id }),
  Tables.load({
    id: (_state: State, { segment }: { segment?: Segment }) =>
      segment?.table_id,
    fetchType: "fetchMetadataAndForeignTables",
    requestType: "fetchMetadataDeprecated",
  }),
)(SegmentRevisionHistoryInner);

import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { PLUGIN_MODERATION } from "metabase/plugins";
import { getRevisionEventsForTimeline } from "metabase/lib/revisions";
import { revertToRevision } from "metabase/query_builder/actions";
import { getUser } from "metabase/selectors/user";

import Revision from "metabase/entities/revisions";
import User from "metabase/entities/users";
import { Timeline, Header } from "./QuestionActivityTimeline.styled";

const { getModerationTimelineEvents } = PLUGIN_MODERATION;

const mapStateToProps = (state, props) => ({
  currentUser: getUser(state),
});

const mapDispatchToProps = {
  revertToRevision,
};

export default _.compose(
  User.loadList({
    loadingAndErrorWrapper: false,
  }),
  Revision.loadList({
    query: (state, props) => ({
      model_type: "card",
      model_id: props.question.id(),
    }),
    wrapped: true,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(QuestionActivityTimeline);

QuestionActivityTimeline.propTypes = {
  question: PropTypes.object.isRequired,
  revisions: PropTypes.array,
  users: PropTypes.array,
  currentUser: PropTypes.object.isRequired,
  revertToRevision: PropTypes.func.isRequired,
};

export function QuestionActivityTimeline({
  question,
  revisions,
  users,
  currentUser,
  revertToRevision,
}) {
  const usersById = useMemo(() => _.indexBy(users, "id"), [users]);
  const canWrite = question.canWrite();
  const moderationReviews = question.getModerationReviews();

  const events = useMemo(() => {
    const moderationEvents = getModerationTimelineEvents(
      moderationReviews,
      usersById,
      currentUser,
    );
    const revisionEvents = getRevisionEventsForTimeline(
      revisions,
      {
        currentUser,
        canWrite,
      },
      revertToRevision,
    );

    return [...revisionEvents, ...moderationEvents];
  }, [
    canWrite,
    moderationReviews,
    revisions,
    usersById,
    currentUser,
    revertToRevision,
  ]);

  return (
    <div>
      <Header>{t`History`}</Header>
      <Timeline
        items={events}
        data-testid="saved-question-history-list"
        revertFn={revertToRevision}
      />
    </div>
  );
}

import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import type {
  Revision as RevisionType,
  User as UserType,
} from "metabase-types/api";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { revertToRevision } from "metabase/query_builder/actions";
import { getUser } from "metabase/selectors/user";

import Revision from "metabase/entities/revisions";
import User from "metabase/entities/users";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { State } from "metabase-types/store";
import { getTimelineEvents } from "metabase/components/Timeline/utils";
import type Question from "metabase-lib/Question";
import { Timeline, Header } from "./QuestionActivityTimeline.styled";

const { getModerationTimelineEvents } = PLUGIN_MODERATION;

interface QuestionActivityTimelineProps {
  question: Question;
  revisions: RevisionType[];
  users: UserType[];
}

export const QuestionActivityTimeline = _.compose(
  User.loadList({
    loadingAndErrorWrapper: false,
  }),
  Revision.loadList({
    query: (state: State, props: QuestionActivityTimelineProps) => ({
      model_type: "card",
      model_id: props.question.id(),
    }),
    wrapped: true,
  }),
)(_QuestionActivityTimeline);

function _QuestionActivityTimeline({
  question,
  revisions,
  users,
}: QuestionActivityTimelineProps) {
  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const usersById = useMemo(() => _.indexBy(users, "id"), [users]);
  const moderationReviews = question.getModerationReviews();

  const events = useMemo(() => {
    const moderationEvents = getModerationTimelineEvents(
      moderationReviews,
      usersById,
      currentUser,
    );
    const revisionEvents = getTimelineEvents({ revisions, currentUser });

    // TODO sort these by timestamp
    return [...revisionEvents, ...moderationEvents];
  }, [moderationReviews, revisions, usersById, currentUser]);

  return (
    <div>
      <Header>{t`History`}</Header>
      <Timeline
        events={events}
        data-testid="saved-question-history-list"
        revert={revision => dispatch(revertToRevision(revision))}
        canWrite={question.canWrite()}
      />
    </div>
  );
}

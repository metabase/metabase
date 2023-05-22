import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { PLUGIN_MODERATION } from "metabase/plugins";
import { revertToRevision } from "metabase/query_builder/actions";
import { getUser } from "metabase/selectors/user";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks/use-revision-list-query";
import { useUserListQuery } from "metabase/common/hooks/use-user-list-query";
import type Question from "metabase-lib/Question";
import { Timeline, Header } from "./QuestionActivityTimeline.styled";

const { getModerationTimelineEvents } = PLUGIN_MODERATION;

interface QuestionActivityTimelineProps {
  question: Question;
}

export function QuestionActivityTimeline({
  question,
}: QuestionActivityTimelineProps) {
  const { data: revisions } = useRevisionListQuery({
    query: { model_type: "card", model_id: question.id() },
  });
  const { data: users } = useUserListQuery();

  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const usersById = useMemo(() => _.indexBy(users ?? [], "id"), [users]);
  const moderationReviews = question.getModerationReviews();

  const events = useMemo(() => {
    const moderationEvents = getModerationTimelineEvents(
      moderationReviews,
      usersById,
      currentUser,
    );
    const revisionEvents = getTimelineEvents({ revisions, currentUser });

    return [...revisionEvents, ...moderationEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
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

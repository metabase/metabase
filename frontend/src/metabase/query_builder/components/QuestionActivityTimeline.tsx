import { useMemo } from "react";

import { useListRevisionsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getActivityTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { getUser } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";

import { revertToRevision } from "../actions";

interface QuestionActivityTimelineProps {
  question: Question;
}

export function QuestionActivityTimeline({
  question,
}: QuestionActivityTimelineProps) {
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({
    id: question.id(),
    entity: "card",
  });

  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const moderationReviews = question.getModerationReviews();

  const events = useMemo(
    () =>
      getActivityTimelineEvents({ revisions, moderationReviews, currentUser }),
    [moderationReviews, revisions, currentUser],
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <RevisionHistoryTimeline
      events={events}
      data-testid="saved-question-history-list"
      revert={(revision) => dispatch(revertToRevision(question.id(), revision))}
      canWrite={question.canWrite()}
      entity="card"
    />
  );
}

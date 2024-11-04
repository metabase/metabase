import { useMemo } from "react";
import _ from "underscore";

import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { revertToRevision } from "metabase/query_builder/actions";
import { getUser } from "metabase/selectors/user";
import type Question from "metabase-lib/v1/Question";

const { getModerationTimelineEvents } = PLUGIN_MODERATION;

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
  } = useRevisionListQuery({
    query: { model_type: "card", model_id: question.id() },
  });

  const currentUser = useSelector(getUser);
  const dispatch = useDispatch();

  const moderationReviews = question.getModerationReviews();

  const events = useMemo(() => {
    const moderationEvents = getModerationTimelineEvents(
      moderationReviews,
      currentUser,
    );
    const revisionEvents = getTimelineEvents({ revisions, currentUser });

    return [...revisionEvents, ...moderationEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [moderationReviews, revisions, currentUser]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Timeline
      events={events}
      data-testid="saved-question-history-list"
      revert={revision => dispatch(revertToRevision(revision))}
      canWrite={question.canWrite()}
    />
  );
}

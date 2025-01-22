import { useMemo } from "react";

import { Timeline } from "metabase/common/components/Timeline";
import { getTimelineEvents } from "metabase/common/components/Timeline/utils";
import { useRevisionListQuery } from "metabase/common/hooks";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { revertToRevision } from "metabase/query_builder/actions";
import { getUser } from "metabase/selectors/user";
import { Group, Skeleton, Stack } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
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

  return (
    <DelayedLoadingAndErrorWrapper
      delay={0}
      loader={
        <Stack spacing="xl">
          <Repeat times={5}>
            <Group spacing="sm" align="flex-start">
              <Skeleton radius="100%" w="1rem" h="1rem" />
              <Skeleton h="1rem" natural />
            </Group>
          </Repeat>
        </Stack>
      }
      loading={isLoading}
      error={error}
    >
      <Timeline
        events={events}
        data-testid="saved-question-history-list"
        revert={revision => dispatch(revertToRevision(revision))}
        canWrite={question.canWrite()}
      />
    </DelayedLoadingAndErrorWrapper>
  );
}

import { useMemo } from "react";

import { useListRevisionsQuery, useRevertRevisionMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import type { Card } from "metabase-types/api";

interface MetricActivityTimelineProps {
  card: Card;
}

export function MetricActivityTimeline({ card }: MetricActivityTimelineProps) {
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({
    id: card.id,
    entity: "card",
  });
  const [revertRevision] = useRevertRevisionMutation();
  const currentUser = useSelector(getUser);

  const events = useMemo(() => {
    const moderationEvents = PLUGIN_MODERATION.getModerationTimelineEvents(
      card.moderation_reviews,
      currentUser,
    );
    const revisionEvents = getTimelineEvents({ revisions, currentUser });
    return [...revisionEvents, ...moderationEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [card.moderation_reviews, revisions, currentUser]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <RevisionHistoryTimeline
      events={events}
      data-testid="saved-question-history-list"
      revert={(revision) =>
        revertRevision({
          entity: "card",
          id: card.id,
          revision_id: revision.id,
        })
      }
      canWrite={card.can_write}
      entity="card"
    />
  );
}

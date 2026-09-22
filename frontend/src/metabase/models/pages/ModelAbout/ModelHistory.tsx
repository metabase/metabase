import { useMemo } from "react";

import { useListRevisionsQuery, useRevertRevisionMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { getUser } from "metabase/current-user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Card } from "metabase-types/api";

export type ModelHistoryProps = {
  card: Card;
};

export function ModelHistory({ card }: ModelHistoryProps) {
  const currentUser = useSelector(getUser);
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({ id: card.id, entity: "card" });
  const [revertToRevision] = useRevertRevisionMutation();

  const events = useMemo(() => {
    const moderationEvents = PLUGIN_MODERATION.getModerationTimelineEvents(
      card.moderation_reviews ?? [],
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
      data-testid="model-history-list"
      revert={(revision) =>
        revertToRevision({
          entity: "card",
          id: card.id,
          revision_id: revision.id,
        }).unwrap()
      }
      canWrite={Boolean(card.can_write) && !card.archived}
      entity="card"
    />
  );
}

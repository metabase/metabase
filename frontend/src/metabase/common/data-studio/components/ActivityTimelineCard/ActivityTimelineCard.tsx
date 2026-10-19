import { useMemo } from "react";
import { t } from "ttag";

import { useListRevisionsQuery, useRevertRevisionMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { RevisionHistoryTimeline } from "metabase/common/components/RevisionHistoryTimeline";
import { getTimelineEvents } from "metabase/common/components/RevisionHistoryTimeline/utils";
import { getUser } from "metabase/current-user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Box, Card, Text } from "metabase/ui";
import type { CardId, DashboardId, ModerationReview } from "metabase-types/api";

import S from "./ActivityTimelineCard.module.css";

type ActivityTimelineCardProps = {
  entity: "card" | "dashboard";
  id: CardId | DashboardId;
  moderationReviews: ModerationReview[] | undefined;
  canWrite: boolean;
  "data-testid": string;
};

/**
 * The revisions and moderation events of a card or dashboard, newest first,
 * each revision with a revert for a user who can write, framed as a Data
 * Studio page card.
 */
export function ActivityTimelineCard(props: ActivityTimelineCardProps) {
  return (
    <Card withBorder shadow="none" p="lg" flex={1} className={S.card}>
      <Box maw={800} pt="lg" px="lg">
        <ActivityTimeline {...props} />
      </Box>
    </Card>
  );
}

function ActivityTimeline({
  entity,
  id,
  moderationReviews,
  canWrite,
  "data-testid": dataTestId,
}: ActivityTimelineCardProps) {
  const currentUser = useSelector(getUser);
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({ entity, id });
  const [revertRevision] = useRevertRevisionMutation();

  const events = useMemo(
    () =>
      [
        ...getTimelineEvents({ revisions, currentUser }),
        ...PLUGIN_MODERATION.getModerationTimelineEvents(
          moderationReviews ?? [],
          currentUser,
        ),
      ].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [moderationReviews, revisions, currentUser],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (events.length === 0) {
    return <Text c="text-secondary">{t`No revision history available.`}</Text>;
  }

  return (
    <RevisionHistoryTimeline
      entity={entity}
      events={events}
      revert={(revision) =>
        revertRevision({ entity, id, revision_id: revision.id }).unwrap()
      }
      canWrite={canWrite}
      data-testid={dataTestId}
    />
  );
}

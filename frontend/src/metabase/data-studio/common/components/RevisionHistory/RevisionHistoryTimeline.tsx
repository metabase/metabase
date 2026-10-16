import { useMemo } from "react";
import { t } from "ttag";

import { useListRevisionsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUserId } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Center, Stack, Text, Timeline } from "metabase/ui";
import { assignUserColors } from "metabase/ui/colors/formatting-colors";
import type { RevisionEntityType } from "metabase-types/api";

import { RevisionItem } from "./RevisionItem";
import type { RevisionActionDescriptor, RevisionDiffOptions } from "./types";

type RevisionHistoryTimelineProps = {
  entityType: RevisionEntityType;
  entityId: number;
  getActionDescription: RevisionActionDescriptor;
  /** Omitted for entities whose revisions carry no per-field diff, so only the action descriptions show */
  diffOptions?: RevisionDiffOptions;
};

export function RevisionHistoryTimeline({
  entityType,
  entityId,
  getActionDescription,
  diffOptions,
}: RevisionHistoryTimelineProps) {
  const currentUserId = useSelector(getUserId);
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({ entity: entityType, id: entityId });

  const userColorAssignments = useMemo(() => {
    if (!revisions || currentUserId == null) {
      return {};
    }
    return assignUserColors(
      revisions.map((r) => String(r.user.id)),
      String(currentUserId),
    );
  }, [revisions, currentUserId]);

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (!revisions || revisions.length === 0) {
    return (
      <Center h="100%">
        <Text c="text-secondary">{t`No revision history available.`}</Text>
      </Center>
    );
  }

  return (
    <Stack p="xxl" maw={720} mx="auto" w="100%">
      <Timeline bulletSize={40} lineWidth={2}>
        {revisions.map((revision) => (
          <RevisionItem
            key={revision.id}
            revision={revision}
            userColor={userColorAssignments[String(revision.user.id)]}
            getActionDescription={getActionDescription}
            diffOptions={diffOptions}
          />
        ))}
      </Timeline>
    </Stack>
  );
}

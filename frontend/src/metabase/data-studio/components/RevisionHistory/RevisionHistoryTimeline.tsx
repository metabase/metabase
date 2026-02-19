import { useMemo } from "react";
import { t } from "ttag";

import { useListRevisionsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { assignUserColors } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import { getUserId } from "metabase/selectors/user";
import { Center, Stack, Text, Timeline } from "metabase/ui";
import type { RevisionEntityType, TableId } from "metabase-types/api";

import { RevisionItem } from "./RevisionItem";
import type { DefinitionType, RevisionActionDescriptor } from "./types";

type RevisionHistoryTimelineProps = {
  entityType: RevisionEntityType;
  entityId: number;
  tableId: TableId;
  getActionDescription: RevisionActionDescriptor;
  definitionLabel: string;
  definitionType: DefinitionType;
};

export function RevisionHistoryTimeline({
  entityType,
  entityId,
  tableId,
  getActionDescription,
  definitionLabel,
  definitionType,
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
    <Stack p="xl" maw={720} mx="auto" w="100%">
      <Timeline bulletSize={40} lineWidth={2}>
        {revisions.map((revision) => (
          <RevisionItem
            key={revision.id}
            revision={revision}
            tableId={tableId}
            userColor={userColorAssignments[String(revision.user.id)]}
            getActionDescription={getActionDescription}
            definitionLabel={definitionLabel}
            definitionType={definitionType}
          />
        ))}
      </Timeline>
    </Stack>
  );
}

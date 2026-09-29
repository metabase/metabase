import { t } from "ttag";

import { useListRevisionsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Stack, Text, Timeline } from "metabase/ui";
import type { RevisionEntityType } from "metabase-types/api";

import { RevisionItem } from "./RevisionItem";
import type { DefinitionType, RevisionActionDescriptor } from "./types";

type RevisionHistoryTimelineProps = {
  entityType: RevisionEntityType;
  entityId: number;
  getActionDescription: RevisionActionDescriptor;
  definitionLabel: string;
  definitionType: DefinitionType;
};

export function RevisionHistoryTimeline({
  entityType,
  entityId,
  getActionDescription,
  definitionLabel,
  definitionType,
}: RevisionHistoryTimelineProps) {
  const {
    data: revisions,
    isLoading,
    error,
  } = useListRevisionsQuery({ entity: entityType, id: entityId });

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
            getActionDescription={getActionDescription}
            definitionLabel={definitionLabel}
            definitionType={definitionType}
          />
        ))}
      </Timeline>
    </Stack>
  );
}

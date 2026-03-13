import { t } from "ttag";

import { Badge, Group, Skeleton, Stack, Title } from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import { DependencyList } from "metabase-enterprise/dependencies/components/DependencyList";
import type { CardId } from "metabase-types/api";

type DependentsSectionProps = {
  cardId: CardId;
};

export function DependentsSection({ cardId }: DependentsSectionProps) {
  const { data: dependents = [], isLoading } = useListNodeDependentsQuery({
    id: cardId,
    type: "card",
  });

  if (isLoading) {
    return <Skeleton height={20} />;
  }

  const label = dependents.length === 1 ? t`Dependent` : t`Dependents`;

  return (
    <Stack role="region" aria-label={label}>
      <Group gap="sm" wrap="nowrap">
        <Badge variant="filled" bg="brand">
          {dependents.length}
        </Badge>
        <Title order={5}>{label}</Title>
      </Group>
      {dependents.length > 0 && <DependencyList nodes={dependents} />}
    </Stack>
  );
}

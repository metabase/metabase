import { useMemo } from "react";
import { match } from "ts-pattern";

import { SimpleGrid, Stack } from "metabase/ui";
import type {
  InspectorCard,
  TransformInspectSource,
  TransformInspectVisitedFields,
} from "metabase-types/api";

import { ScalarCard } from "../ScalarCard";
import { VisualizationCard } from "../VisualizationCard";

import { groupCardsBySource, sortGroupsByScore } from "./utils";

type ComparisonLayoutProps = {
  cards: InspectorCard[];
  sources: TransformInspectSource[];
  visitedFields?: TransformInspectVisitedFields;
};

export const ComparisonLayout = ({
  cards,
  sources,
  visitedFields,
}: ComparisonLayoutProps) => {
  const groups = useMemo(
    () => groupCardsBySource(cards, sources),
    [cards, sources],
  );

  const sortedGroups = useMemo(
    () => sortGroupsByScore({ sources, visitedFields, groups }),
    [groups, sources, visitedFields],
  );

  const renderCard = (card: InspectorCard) =>
    match(card.display)
      .with("scalar", () => <ScalarCard card={card} key={card.id} />)
      .otherwise(() => <VisualizationCard card={card} key={card.id} />);

  return (
    <Stack gap="lg">
      {sortedGroups.map((group) => (
        <SimpleGrid key={group.groupId} cols={2} spacing="md">
          <Stack gap="sm">{group.inputCards.map(renderCard)}</Stack>
          <Stack gap="sm">{group.outputCards.map(renderCard)}</Stack>
        </SimpleGrid>
      ))}
    </Stack>
  );
};

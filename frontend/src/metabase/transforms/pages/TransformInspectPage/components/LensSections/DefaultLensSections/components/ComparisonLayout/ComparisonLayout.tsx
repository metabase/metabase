import { useMemo } from "react";
import { match } from "ts-pattern";

import { useProgressiveGroupsLoader } from "metabase/transforms/pages/TransformInspectPage/components/LensSections/DefaultLensSections/components/ComparisonLayout/useProgressiveGroupsLoader";
import { SimpleGrid, Stack } from "metabase/ui";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  InspectorCard,
  InspectorSource,
  InspectorVisitedFields,
} from "metabase-types/api";

import { ScalarCard } from "../ScalarCard";
import { VisualizationCard } from "../VisualizationCard";

import { groupCardsBySource, sortGroupsByScore } from "./utils";

type ComparisonLayoutProps = {
  cards: InspectorCard[];
  sources: InspectorSource[];
  visitedFields?: InspectorVisitedFields;
  metadata: Metadata;
};

export const ComparisonLayout = ({
  cards,
  sources,
  visitedFields,
  metadata,
}: ComparisonLayoutProps) => {
  const groups = useMemo(
    () => groupCardsBySource(cards, sources),
    [cards, sources],
  );

  const sortedGroups = useMemo(
    () => sortGroupsByScore(groups, sources, visitedFields),
    [groups, sources, visitedFields],
  );

  const visibleGroups = useProgressiveGroupsLoader(sortedGroups);

  const renderCard = (card: InspectorCard) =>
    match(card.display)
      .with("scalar", () => <ScalarCard card={card} key={card.id} />)
      .otherwise(() => (
        <VisualizationCard card={card} metadata={metadata} key={card.id} />
      ));

  return (
    <Stack gap="lg">
      {visibleGroups.map((group) => (
        <SimpleGrid key={group.groupId} cols={2} spacing="md">
          <Stack gap="sm">{group.inputCards.map(renderCard)}</Stack>
          <Stack gap="sm">{group.outputCards.map(renderCard)}</Stack>
        </SimpleGrid>
      ))}
    </Stack>
  );
};

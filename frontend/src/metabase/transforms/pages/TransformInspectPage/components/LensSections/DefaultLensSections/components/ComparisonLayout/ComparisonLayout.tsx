import { useEffect, useMemo } from "react";
import { match } from "ts-pattern";

import { useProgressiveLoader } from "metabase/common/hooks";
import { SimpleGrid, Stack } from "metabase/ui";
import type {
  InspectorCard,
  InspectorSource,
  InspectorVisitedFields,
} from "metabase-types/api";

import { useLensContentContext } from "../../../../LensContent/LensContentContext";
import { ScalarCard } from "../ScalarCard";
import { VisualizationCard } from "../VisualizationCard";

import {
  getAllCards,
  getVisibleGroups,
  groupCardsBySource,
  sortGroupsByScore,
} from "./utils";

type ComparisonLayoutProps = {
  cards: InspectorCard[];
  sources: InspectorSource[];
  visitedFields?: InspectorVisitedFields;
};

export const ComparisonLayout = ({
  cards,
  sources,
  visitedFields,
}: ComparisonLayoutProps) => {
  const { subscribeToCardLoaded } = useLensContentContext();

  const groups = useMemo(
    () => groupCardsBySource(cards, sources),
    [cards, sources],
  );

  const sortedGroups = useMemo(
    () => sortGroupsByScore(groups, sources, visitedFields),
    [groups, sources, visitedFields],
  );

  const allCards = useMemo(() => getAllCards(sortedGroups), [sortedGroups]);

  const [visibleCards, markCardAsReady] = useProgressiveLoader({
    items: allCards,
    getItemId: (card) => card.id,
    chunkSize: 4,
  });

  useEffect(
    () => subscribeToCardLoaded(markCardAsReady),
    [subscribeToCardLoaded, markCardAsReady],
  );

  const visibleGroups = useMemo(
    () => getVisibleGroups(sortedGroups, visibleCards),
    [sortedGroups, visibleCards],
  );

  const renderCard = (card: InspectorCard) =>
    match(card.display)
      .with("scalar", () => <ScalarCard card={card} key={card.id} />)
      .otherwise(() => <VisualizationCard card={card} key={card.id} />);

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

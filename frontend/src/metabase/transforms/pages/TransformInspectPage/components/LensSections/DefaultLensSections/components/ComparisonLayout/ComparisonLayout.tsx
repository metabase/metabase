import { useCallback, useEffect, useMemo } from "react";
import { match } from "ts-pattern";

import { useProgressiveLoader } from "metabase/common/hooks";
import { SimpleGrid, Stack } from "metabase/ui";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  InspectorCard,
  InspectorCardId,
  InspectorSource,
  InspectorVisitedFields,
} from "metabase-types/api";

import { useLensContentContext } from "../../../../LensContent/LensContentContext";
import { ScalarCard } from "../ScalarCard";
import { VisualizationCard } from "../VisualizationCard";

import {
  getGroupCardCounts,
  getGroupsByCards,
  groupCardsBySource,
  sortGroupsByScore,
} from "./utils";

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
  const { subscribeToCardLoaded } = useLensContentContext();

  const groups = useMemo(
    () => groupCardsBySource(cards, sources),
    [cards, sources],
  );

  const sortedGroups = useMemo(
    () => sortGroupsByScore(groups, sources, visitedFields),
    [groups, sources, visitedFields],
  );

  const [visibleGroups, markGroupAsReady] = useProgressiveLoader({
    items: sortedGroups,
    getItemId: (group) => group.groupId,
    chunkSize: 4,
  });

  const groupsByCardMap = useMemo(
    () => getGroupsByCards(sortedGroups),
    [sortedGroups],
  );

  const groupCardCounts = useMemo(
    () => getGroupCardCounts(sortedGroups),
    [sortedGroups],
  );

  const loadedPerGroupRef = useMemo(
    () => new Map<string, Set<InspectorCardId>>(),
    [],
  );

  const handleCardLoaded = useCallback(
    (cardId: string) => {
      const groupId = groupsByCardMap.get(cardId)?.groupId;
      if (!groupId) {
        return;
      }
      const loaded = loadedPerGroupRef.get(groupId) ?? new Set();
      if (!loadedPerGroupRef.has(groupId)) {
        loadedPerGroupRef.set(groupId, loaded);
      }
      loaded.add(cardId);
      if (loaded.size === groupCardCounts.get(groupId)) {
        markGroupAsReady(groupId);
      }
    },
    [groupsByCardMap, groupCardCounts, markGroupAsReady, loadedPerGroupRef],
  );

  useEffect(
    () => subscribeToCardLoaded(handleCardLoaded),
    [subscribeToCardLoaded, handleCardLoaded],
  );

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

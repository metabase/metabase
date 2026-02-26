import { useCallback, useEffect, useMemo } from "react";

import { useProgressiveLoader } from "metabase/common/hooks";
import type { InspectorCardId } from "metabase-types/api";

import { useLensContentContext } from "../../../../LensContent/LensContentContext";

import { type CardGroup, getGroupCardCounts, getGroupsByCards } from "./utils";

export const useProgressiveGroupsLoader = (groups: CardGroup[]) => {
  const { subscribeToCardLoaded } = useLensContentContext();

  const [visibleGroups, markGroupAsReady] = useProgressiveLoader({
    items: groups,
    getItemId: (group) => group.groupId,
    chunkSize: 4,
  });

  const groupsByCardMap = useMemo(() => getGroupsByCards(groups), [groups]);

  const groupCardCounts = useMemo(() => getGroupCardCounts(groups), [groups]);

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

  return visibleGroups;
};

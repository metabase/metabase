import { useCallback, useEffect, useRef, useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import type { CollectionId } from "metabase-types/api";

import type { CardEmbedRef } from "../components/Editor/types";
import { useReportsSelector } from "../redux-utils";
import { fetchReportQuestionData, setCardEmbeds } from "../reports.slice";
import { getCardEmbeds } from "../selectors";

export function useReportState(reportData?: {
  name: string;
  document: string;
}) {
  const dispatch = useDispatch();
  const cardEmbeds = useReportsSelector(getCardEmbeds);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportCollectionId, setReportCollectionId] =
    useState<CollectionId | null>(null);
  const previousEmbedsRef = useRef<CardEmbedRef[]>([]);

  // Sync cardEmbeds changes with data fetching
  useEffect(() => {
    cardEmbeds.forEach((embed: CardEmbedRef) => {
      dispatch(fetchReportQuestionData({ cardId: embed.id }));
    });
  }, [cardEmbeds, dispatch]);

  // Sync report data when it changes
  useEffect(() => {
    if (reportData) {
      setReportTitle(reportData.name);
      setReportContent(reportData.document);
    }
  }, [reportData]);

  const updateCardEmbeds = useCallback(
    (newEmbeds: CardEmbedRef[]) => {
      // Only dispatch if the embeds have actually changed to prevent infinite loops
      const prevEmbeds = previousEmbedsRef.current;
      const hasChanged =
        newEmbeds.length !== prevEmbeds.length ||
        newEmbeds.some(
          (embed, index) =>
            !prevEmbeds[index] ||
            embed.id !== prevEmbeds[index].id ||
            embed.name !== prevEmbeds[index].name,
        );

      if (hasChanged) {
        previousEmbedsRef.current = newEmbeds;
        dispatch(setCardEmbeds(newEmbeds));
      }
    },
    [dispatch],
  );

  return {
    reportTitle,
    setReportTitle,
    reportContent,
    setReportContent,
    reportCollectionId,
    setReportCollectionId,
    cardEmbeds,
    updateCardEmbeds,
  };
}

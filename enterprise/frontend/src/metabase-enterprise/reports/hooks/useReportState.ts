import { useCallback, useEffect, useRef, useState } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type { CollectionId } from "metabase-types/api";

import type { QuestionEmbed } from "../reports.slice";
import { fetchReportQuestionData, setQuestionEmbeds } from "../reports.slice";
import { getQuestionEmbeds } from "../selectors";

export function useReportState(reportData?: {
  name: string;
  document: string;
}) {
  const dispatch = useDispatch();
  const questionEmbeds = useSelector(getQuestionEmbeds);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportCollectionId, setReportCollectionId] =
    useState<CollectionId | null>(null);
  const previousEmbedsRef = useRef<QuestionEmbed[]>([]);

  // Sync questionEmbeds changes with data fetching
  useEffect(() => {
    questionEmbeds.forEach((embed: QuestionEmbed) => {
      if (embed.snapshotId) {
        dispatch(
          fetchReportQuestionData({
            cardId: embed.id,
            snapshotId: embed.snapshotId,
          }),
        );
      }
    });
  }, [questionEmbeds, dispatch]);

  // Sync report data when it changes
  useEffect(() => {
    if (reportData) {
      setReportTitle(reportData.name);
      setReportContent(reportData.document);
    }
  }, [reportData]);

  const updateQuestionEmbeds = useCallback(
    (newEmbeds: QuestionEmbed[]) => {
      // Only dispatch if the embeds have actually changed to prevent infinite loops
      const prevEmbeds = previousEmbedsRef.current;
      const hasChanged =
        newEmbeds.length !== prevEmbeds.length ||
        newEmbeds.some(
          (embed, index) =>
            !prevEmbeds[index] ||
            embed.id !== prevEmbeds[index].id ||
            embed.snapshotId !== prevEmbeds[index].snapshotId ||
            embed.name !== prevEmbeds[index].name,
        );

      if (hasChanged) {
        previousEmbedsRef.current = newEmbeds;
        dispatch(setQuestionEmbeds(newEmbeds));
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
    questionEmbeds,
    updateQuestionEmbeds,
  };
}

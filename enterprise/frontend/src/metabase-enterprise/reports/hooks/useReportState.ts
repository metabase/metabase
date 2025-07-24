import { useCallback, useEffect, useRef, useState } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type { CollectionId } from "metabase-types/api";

import type { QuestionRef } from "../reports.slice";
import { fetchReportQuestionData, setQuestionRefs } from "../reports.slice";
import { getQuestionRefs } from "../selectors";

export function useReportState(reportData?: {
  name: string;
  document: string;
}) {
  const dispatch = useDispatch();
  const questionRefs = useSelector(getQuestionRefs);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportCollectionId, setReportCollectionId] =
    useState<CollectionId | null>(null);
  const previousRefsRef = useRef<QuestionRef[]>([]);

  // Sync questionRefs changes with data fetching
  useEffect(() => {
    questionRefs.forEach((ref) => {
      if (ref.snapshotId) {
        dispatch(
          fetchReportQuestionData({
            cardId: ref.id,
            snapshotId: ref.snapshotId,
          }),
        );
      }
    });
  }, [questionRefs, dispatch]);

  // Sync report data when it changes
  useEffect(() => {
    if (reportData) {
      setReportTitle(reportData.name);
      setReportContent(reportData.document);
    }
  }, [reportData]);

  const updateQuestionRefs = useCallback(
    (newRefs: QuestionRef[]) => {
      // Only dispatch if the refs have actually changed to prevent infinite loops
      const prevRefs = previousRefsRef.current;
      const hasChanged =
        newRefs.length !== prevRefs.length ||
        newRefs.some(
          (ref, index) =>
            !prevRefs[index] ||
            ref.id !== prevRefs[index].id ||
            ref.snapshotId !== prevRefs[index].snapshotId ||
            ref.name !== prevRefs[index].name,
        );

      if (hasChanged) {
        previousRefsRef.current = newRefs;
        dispatch(setQuestionRefs(newRefs));
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
    questionRefs,
    updateQuestionRefs,
  };
}

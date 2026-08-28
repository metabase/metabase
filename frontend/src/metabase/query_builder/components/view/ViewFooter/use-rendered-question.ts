import { useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import {
  getIsRunning,
  getLastRunQuestion,
  getQuestion,
  getRawSeries,
} from "../../../store/selectors";

// The current question can be ahead of the retained result while a forced rerun is
// pending or was cancelled, so whether the result is pivoted has to come from the card
// that produced it, and copy has to wait out the mismatch
const getStaleReason = (
  question: Question | undefined,
  isPivotResult: boolean,
  isRunning: boolean,
): string | null => {
  if (isRunning) {
    return t`Results are still loading`;
  }
  if (question != null && isPivotResult !== (question.display() === "pivot")) {
    return t`Rerun the query to copy its results`;
  }
  return null;
};

export const useRenderedQuestion = () => {
  const question = useSelector(getQuestion);
  const lastRunQuestion = useSelector(getLastRunQuestion);
  const isRunning = useSelector(getIsRunning);
  const rawSeries = useSelector(getRawSeries);

  return useMemo(() => {
    const renderedCard = rawSeries?.[0]?.card;
    const renderedQuestion =
      question != null && renderedCard != null
        ? // Question's card is typed as Card, but it's not always actually a Card
          // clean this up when Question gets cleaned up
          question.setCard(renderedCard as Card)
        : question;
    const isPivotResult = lastRunQuestion?.display() === "pivot";
    return {
      question: renderedQuestion,
      isPivotResult,
      staleReason: getStaleReason(question, isPivotResult, isRunning),
    };
  }, [question, lastRunQuestion, rawSeries, isRunning]);
};

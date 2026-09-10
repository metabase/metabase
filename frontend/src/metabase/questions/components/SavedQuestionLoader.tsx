import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";

import { skipToken, useGetCardQuery } from "metabase/api";
import { useQuestionFromCard } from "metabase/metadata-store";
import { loadMetadataForCard } from "metabase/questions/actions";
import { useDispatch } from "metabase/redux";
import type { CardId } from "metabase-types/api";

import type { QuestionLoaderChildrenProps } from "./QuestionLoader";

type SavedQuestionLoaderProps = {
  questionId: CardId | null | undefined;
  children: (state: QuestionLoaderChildrenProps) => ReactNode;
};

/*
 * SavedQuestionLoader
 *
 * Load a saved question and return it to the calling component
 *
 * @example
 *
 * Render prop style
 * import { SavedQuestionLoader } from 'metabase/questions/components/SavedQuestionLoader'
 *
 * function ExampleSavedQuestionFeature({ questionId }) {
 *   return (
 *     <SavedQuestionLoader questionId={questionId}>
 *       {({ question, loading, error }) => {
 *         // render content
 *       }}
 *     </SavedQuestionLoader>
 *   );
 * }
 */
export function SavedQuestionLoader({
  questionId,
  children,
}: SavedQuestionLoaderProps) {
  const buildQuestion = useQuestionFromCard();
  const dispatch = useDispatch();

  const {
    data: card,
    isLoading: isCardLoading,
    isFetching,
    error: cardError,
  } = useGetCardQuery(questionId != null ? { id: questionId } : skipToken);

  // Load metadata for the card when it's available
  useEffect(() => {
    if (card) {
      dispatch(loadMetadataForCard(card));
    }
  }, [card, dispatch]);

  const question = useMemo(() => {
    if (!card || isFetching) {
      return null;
    }
    return buildQuestion(card);
  }, [card, isFetching, buildQuestion]);

  const loading = isCardLoading || isFetching;
  const error = cardError;

  return children({ question, loading, error });
}

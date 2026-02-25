import type { ReactNode } from "react";
import { useMemo } from "react";

import { skipToken, useGetCardQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { CardId } from "metabase-types/api";

import type { QuestionLoaderChildState } from "./QuestionLoader";

type SavedQuestionLoaderProps = {
  questionId: CardId | null | undefined;
  children: (state: QuestionLoaderChildState) => ReactNode;
};

/*
 * SavedQuestionLoader
 *
 * Load a saved question and return it to the calling component
 *
 * @example
 *
 * Render prop style
 * import { SavedQuestionLoader } from 'metabase/common/components/SavedQuestionLoader'
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
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const {
    data: card,
    isLoading: isCardLoading,
    isFetching,
    error: cardError,
  } = useGetCardQuery(questionId != null ? { id: questionId } : skipToken);

  // Load metadata for the card when it's available
  useMemo(() => {
    if (card) {
      dispatch(loadMetadataForCard(card));
    }
  }, [card, dispatch]);

  const question = useMemo(() => {
    if (!card || isFetching) {
      return null;
    }
    return new Question(card, metadata);
  }, [card, isFetching, metadata]);

  const loading = isCardLoading || isFetching;
  const error = cardError;

  return children({ question, loading, error }) ?? null;
}

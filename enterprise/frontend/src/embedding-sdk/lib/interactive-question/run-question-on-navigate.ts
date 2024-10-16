import { runQuestionQuerySdk } from "embedding-sdk/lib/interactive-question/run-question-query";
import type {
  NavigateToNewCardParams,
  SdkQuestionState,
} from "embedding-sdk/types/question";
import { loadCard } from "metabase/query_builder/actions/core/card";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import Question from "metabase-lib/v1/Question";
import { cardIsEquivalent } from "metabase-lib/v1/queries/utils/card";
import type { Dispatch, GetState } from "metabase-types/store";

interface RunQuestionOnNavigateParams extends NavigateToNewCardParams {
  originalQuestion?: Question;
  onQuestionChange: (question: Question) => void;
}

export const runQuestionOnNavigateSdk =
  (params: RunQuestionOnNavigateParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionState | null> => {
    let {
      nextCard,
      previousCard,
      originalQuestion,
      cancelDeferred,
      onQuestionChange,
    } = params;

    // Do not reload questions with breakouts when clicking on a legend item
    if (previousCard === nextCard) {
      return null;
    }

    // Fallback when a visualization legend is clicked
    if (cardIsEquivalent(previousCard, nextCard)) {
      nextCard = await loadCard(nextCard.id, { dispatch, getState });
    } else {
      nextCard = getCardAfterVisualizationClick(nextCard, previousCard);
    }

    // Optimistic update the UI before we re-fetch the query metadata.
    onQuestionChange(new Question(nextCard, getMetadata(getState())));

    await dispatch(loadMetadataForCard(nextCard));

    const state = await runQuestionQuerySdk({
      question: new Question(nextCard, getMetadata(getState())),
      originalQuestion,
      cancelDeferred,
    });

    return state as SdkQuestionState;
  };

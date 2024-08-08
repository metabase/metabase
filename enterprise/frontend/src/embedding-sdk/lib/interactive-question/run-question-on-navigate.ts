import type {
  NavigateToNewCardParams,
  SdkQuestionState,
} from "embedding-sdk/types/question";
import { loadCard } from "metabase/lib/card";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import Question from "metabase-lib/v1/Question";
import { cardIsEquivalent } from "metabase-lib/v1/queries/utils/card";
import type { Dispatch, GetState } from "metabase-types/store";

import { updateQuestionSdk } from "./update-question";

interface RunQuestionOnNavigateParams extends NavigateToNewCardParams {
  originalQuestion?: Question;
}

export const runQuestionOnNavigateSdk =
  (params: RunQuestionOnNavigateParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionState | null> => {
    let { nextCard, previousCard, originalQuestion } = params;

    // Do not reload questions with breakouts when clicking on a legend item
    if (previousCard === nextCard) {
      return null;
    }

    const metadata = getMetadata(getState());

    // Fallback when a visualization legend is clicked
    if (cardIsEquivalent(previousCard, nextCard)) {
      nextCard = await loadCard(nextCard.id, { dispatch, getState });
    } else {
      nextCard = getCardAfterVisualizationClick(nextCard, previousCard);
    }

    const previousQuestion = new Question(previousCard, metadata);
    const nextQuestion = new Question(nextCard, metadata);

    const result = await dispatch(
      updateQuestionSdk({
        previousQuestion,
        nextQuestion,
        originalQuestion,
        onQuestionChange: () => {},
      }),
    );

    return result as SdkQuestionState;
  };

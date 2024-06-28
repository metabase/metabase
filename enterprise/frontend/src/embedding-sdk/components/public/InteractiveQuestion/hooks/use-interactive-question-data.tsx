import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import {
  getCard,
  getFirstQueryResult,
  getQueryResults,
  getQuestion,
  getUiControls,
} from "metabase/query_builder/selectors";
import type * as Lib from "metabase-lib";

const returnNull = () => null;
export const useInteractiveQuestionData = () => {
  const dispatch = useDispatch();

  const question = useSelector(getQuestion);
  const card = useSelector(getCard);
  const result = useSelector(getFirstQueryResult);
  const uiControls = useSelector(getUiControls);
  const queryResults = useSelector(getQueryResults);

  const defaultHeight = card ? getDefaultVizHeight(card.display) : undefined;

  const { isRunning: isQueryRunning } = uiControls;

  const hasQuestionChanges =
    card && (!card.id || card.id !== card.original_card_id);

  if (question) {
    question.alertType = returnNull; // FIXME: this removes "You can also get an alert when there are some results." feature for question
  }

  const onQueryChange = async (query: Lib.Query) => {
    if (question) {
      const nextQuestion = question.setQuery(query);
      await dispatch(updateQuestion(nextQuestion, { run: true }));
    }
  };

  return {
    question,
    card,
    result,
    uiControls,
    queryResults,
    isQueryRunning,
    hasQuestionChanges,
    defaultHeight,
    onQueryChange,
  };
};

import { useCallback } from "react";

import {
  getCurrentQuestionPath,
  setCurrentQuestionPath as setCurrentQuestionPathAction,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";

export const useMetabotReactions = () => {
  const dispatch = useDispatch();

  const currentQuestionPath = useSelector(getCurrentQuestionPath);

  const setCurrentQuestionPath = useCallback(
    (questionPath: string | null) => {
      dispatch(setCurrentQuestionPathAction(questionPath));
    },
    [dispatch],
  );

  return {
    currentQuestionPath,
    setCurrentQuestionPath,
  };
};

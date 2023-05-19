import Questions from "metabase/entities/questions";
import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { CardId, CardQuery } from "metabase-types/api";
import Question from "metabase-lib/Question";

export const useQuestionQuery = (
  props: UseEntityQueryProps<CardId, CardQuery>,
): UseEntityQueryResult<Question> => {
  return useEntityQuery(props, {
    fetch: Questions.actions.fetch,
    getObject: Questions.selectors.getObject,
    getLoading: Questions.selectors.getLoading,
    getError: Questions.selectors.getError,
  });
};

import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import Questions from "metabase/entities/questions";
import Question from "metabase-lib/Question";
import { CardId, CardQuery } from "metabase-types/api";

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

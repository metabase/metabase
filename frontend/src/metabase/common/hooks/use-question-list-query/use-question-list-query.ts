import Questions from "metabase/entities/questions";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { CardListQuery } from "metabase-types/api";
import Question from "metabase-lib/Question";

export const useQuestionListQuery = (
  props: UseEntityListQueryProps<CardListQuery> = {},
): UseEntityListQueryResult<Question> => {
  return useEntityListQuery(props, {
    fetchList: Questions.actions.fetchList,
    getList: Questions.selectors.getList,
    getLoading: Questions.selectors.getLoading,
    getError: Questions.selectors.getError,
  });
};

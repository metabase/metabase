import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import Questions from "metabase/entities/questions";
import Question from "metabase-lib/Question";
import { CardListQuery } from "metabase-types/api";

export const useQuestionListQuery = (
  props: UseEntityListQueryProps<CardListQuery> = {},
): UseEntityListQueryResult<Question> => {
  return useEntityListQuery(props, {
    fetchList: Questions.actions.fetchList,
    getList: Questions.selectors.getList,
    getLoading: Questions.selectors.getLoading,
    getLoaded: Questions.selectors.getLoaded,
    getError: Questions.selectors.getError,
  });
};

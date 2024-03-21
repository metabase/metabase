import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/use-entity-list-query";
import Questions from "metabase/entities/questions";
import type Question from "metabase-lib/v1/Question";
import type { CardListQuery } from "metabase-types/api";

export const useQuestionListQuery = (
  props: UseEntityListQueryProps<CardListQuery> = {},
): UseEntityListQueryResult<Question> => {
  return useEntityListQuery(props, {
    fetchList: Questions.actions.fetchList,
    getList: Questions.selectors.getList,
    getLoading: Questions.selectors.getLoading,
    getLoaded: Questions.selectors.getLoaded,
    getError: Questions.selectors.getError,
    getListMetadata: Questions.selectors.getListMetadata,
  });
};

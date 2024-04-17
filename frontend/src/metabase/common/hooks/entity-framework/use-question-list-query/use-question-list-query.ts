import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import Questions from "metabase/entities/questions";
import type Question from "metabase-lib/v1/Question";
import type { ListCardsRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useQuestionListQuery = (
  props: UseEntityListQueryProps<ListCardsRequest> = {},
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

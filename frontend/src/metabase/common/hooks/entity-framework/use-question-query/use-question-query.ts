import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/entity-framework/use-entity-query";
import Questions from "metabase/entities/questions";
import type Question from "metabase-lib/v1/Question";
import type { CardId, CardQuery } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
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

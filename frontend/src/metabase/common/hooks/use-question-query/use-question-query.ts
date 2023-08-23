import Questions from "metabase/entities/questions";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import type { CardId, CardQuery } from "metabase-types/api";
import type Question from "metabase-lib/Question";

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

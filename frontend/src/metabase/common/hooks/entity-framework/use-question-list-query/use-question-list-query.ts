import { skipToken, useListCardsQuery } from "metabase/api";
import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type { ListCardsRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useQuestionListQuery = ({
  query,
  reload = false,
  enabled = true,
}: UseEntityListQueryProps<ListCardsRequest> = {}): UseEntityListQueryResult<Question> => {
  const {
    data: response,
    isFetching,
    isSuccess,
    error,
  } = useListCardsQuery(enabled ? (query ?? undefined) : skipToken, {
    refetchOnMountOrArgChange: reload,
  });
  const data = useSelector((state) => {
    if (!response) {
      return undefined;
    }
    const metadata = getMetadata(state);
    return response
      .map(({ id }) => metadata.question(id))
      .filter((question): question is Question => question != null);
  });
  return {
    data,
    isLoading: isFetching,
    isLoaded: isSuccess,
    error,
  };
};

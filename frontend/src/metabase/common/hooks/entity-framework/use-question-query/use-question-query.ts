import { skipToken, useGetCardQuery } from "metabase/api";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type { CardId, GetCardRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useQuestionQuery = ({
  id,
  query,
  reload = false,
  enabled = true,
}: UseEntityQueryProps<
  CardId,
  Omit<GetCardRequest, "id">
>): UseEntityQueryResult<Question> => {
  const isActive = enabled && id != null;
  const { isFetching, error } = useGetCardQuery(
    isActive ? { id, ...query } : skipToken,
    { refetchOnMountOrArgChange: reload },
  );
  const data = useSelector((state) =>
    id != null ? (getMetadata(state).question(id) ?? undefined) : undefined,
  );
  return {
    data,
    isLoading: isFetching || (isActive && data == null),
    error,
  };
};

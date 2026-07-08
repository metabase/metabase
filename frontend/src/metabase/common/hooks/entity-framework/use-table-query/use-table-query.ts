import { skipToken, useGetTableQuery } from "metabase/api";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type Table from "metabase-lib/v1/metadata/Table";
import type { GetTableRequest, TableId } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useTableQuery = ({
  id,
  query,
  reload = false,
  enabled = true,
}: UseEntityQueryProps<
  TableId,
  GetTableRequest
>): UseEntityQueryResult<Table> => {
  const isActive = enabled && id != null;
  const { isFetching, error } = useGetTableQuery(
    isActive ? { id, ...query } : skipToken,
    { refetchOnMountOrArgChange: reload },
  );
  const data = useSelector((state) =>
    id != null ? (getMetadata(state).table(id) ?? undefined) : undefined,
  );
  return {
    data,
    isLoading: isFetching || (isActive && data == null),
    error,
  };
};

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, GetDatabaseRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useDatabaseQuery = ({
  id,
  query,
  reload = false,
  enabled = true,
}: UseEntityQueryProps<
  DatabaseId,
  Omit<GetDatabaseRequest, "id">
>): UseEntityQueryResult<Database> => {
  const isActive = enabled && id != null;
  const { isFetching, error } = useGetDatabaseQuery(
    isActive ? { id, ...query } : skipToken,
    { refetchOnMountOrArgChange: reload },
  );
  const data = useSelector((state) =>
    id != null ? (getMetadata(state).database(id) ?? undefined) : undefined,
  );
  return {
    data,
    isLoading: isFetching || (isActive && data == null),
    error,
  };
};

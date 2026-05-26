import { skipToken, useListDatabasesQuery } from "metabase/api";
import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type Database from "metabase-lib/v1/metadata/Database";
import type { ListDatabasesRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useDatabaseListQuery = ({
  query,
  reload = false,
  enabled = true,
}: UseEntityListQueryProps<ListDatabasesRequest> = {}): UseEntityListQueryResult<Database> => {
  const {
    data: response,
    isFetching,
    isSuccess,
    error,
  } = useListDatabasesQuery(enabled ? (query ?? undefined) : skipToken, {
    refetchOnMountOrArgChange: reload,
  });
  const data = useSelector((state) => {
    if (!response) {
      return undefined;
    }
    const metadata = getMetadata(state);
    return response.data
      .map(({ id }) => metadata.database(id))
      .filter((database): database is Database => database != null);
  });
  return {
    data,
    isLoading: isFetching,
    isLoaded: isSuccess,
    error,
  };
};

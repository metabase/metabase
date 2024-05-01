import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import Databases from "metabase/entities/databases";
import type Database from "metabase-lib/v1/metadata/Database";
import type { ListDatabasesRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useDatabaseListQuery = (
  props: UseEntityListQueryProps<ListDatabasesRequest> = {},
): UseEntityListQueryResult<Database> => {
  return useEntityListQuery(props, {
    fetchList: Databases.actions.fetchList,
    getList: Databases.selectors.getList,
    getLoading: Databases.selectors.getLoading,
    getLoaded: Databases.selectors.getLoaded,
    getError: Databases.selectors.getError,
    getListMetadata: Databases.selectors.getListMetadata,
  });
};

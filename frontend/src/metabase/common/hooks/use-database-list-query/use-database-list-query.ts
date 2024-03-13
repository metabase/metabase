import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/use-entity-list-query";
import Databases from "metabase/entities/databases";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseListQuery } from "metabase-types/api";

export const useDatabaseListQuery = (
  props: UseEntityListQueryProps<DatabaseListQuery> = {},
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

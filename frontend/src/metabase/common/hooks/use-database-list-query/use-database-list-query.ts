import Databases from "metabase/entities/databases";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { DatabaseListQuery } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";

export const useDatabaseListQuery = (
  props: UseEntityListQueryProps<DatabaseListQuery> = {},
): UseEntityListQueryResult<Database> => {
  return useEntityListQuery(props, {
    fetchList: Databases.actions.fetchList,
    getList: Databases.selectors.getList,
    getLoading: Databases.selectors.getLoading,
    getLoaded: Databases.selectors.getLoaded,
    getError: Databases.selectors.getError,
  });
};

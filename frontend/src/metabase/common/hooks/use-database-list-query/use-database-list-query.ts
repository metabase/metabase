import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import Databases from "metabase/entities/databases";
import Database from "metabase-lib/metadata/Database";
import { DatabaseListQuery } from "metabase-types/api";

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

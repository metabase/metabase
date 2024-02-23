import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import Databases from "metabase/entities/databases";
import Database from "metabase-lib/metadata/Database";
import { DatabaseId, DatabaseQuery } from "metabase-types/api";

export const useDatabaseQuery = (
  props: UseEntityQueryProps<DatabaseId, DatabaseQuery>,
): UseEntityQueryResult<Database> => {
  return useEntityQuery(props, {
    fetch: Databases.actions.fetch,
    getObject: Databases.selectors.getObject,
    getLoading: Databases.selectors.getLoading,
    getError: Databases.selectors.getError,
  });
};

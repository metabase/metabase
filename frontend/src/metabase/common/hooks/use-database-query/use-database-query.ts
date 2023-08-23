import Databases from "metabase/entities/databases";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import type { DatabaseId, DatabaseQuery } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";

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

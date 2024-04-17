import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/entity-framework/use-entity-query";
import Databases from "metabase/entities/databases";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, GetDatabaseRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useDatabaseQuery = (
  props: UseEntityQueryProps<DatabaseId, Omit<GetDatabaseRequest, "id">>,
): UseEntityQueryResult<Database> => {
  return useEntityQuery(props, {
    fetch: Databases.actions.fetch,
    getObject: Databases.selectors.getObject,
    getLoading: Databases.selectors.getLoading,
    getError: Databases.selectors.getError,
  });
};

import Databases from "metabase/entities/databases";
import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { DatabaseId, DatabaseIdFieldListQuery } from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";

export const useDatabaseIdFieldListQuery = (
  props: UseEntityQueryProps<DatabaseId, DatabaseIdFieldListQuery>,
): UseEntityQueryResult<Field[]> => {
  return useEntityQuery(props, {
    fetch: Databases.actions.fetchIdfields,
    getObject: Databases.selectors.getIdfields,
    getLoading: Databases.selectors.getLoading,
    getError: Databases.selectors.getError,
    requestType: "idfields",
  });
};

import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import Databases from "metabase/entities/databases";
import Field from "metabase-lib/metadata/Field";
import { DatabaseId, DatabaseIdFieldListQuery } from "metabase-types/api";

export const useDatabaseIdFieldListQuery = (
  props: UseEntityQueryProps<DatabaseId, DatabaseIdFieldListQuery>,
): UseEntityQueryResult<Field[]> => {
  return useEntityQuery(props, {
    fetch: Databases.actions.fetchIdFields,
    getObject: state =>
      Databases.selectors.getIdFields(state, { databaseId: props.id }),
    getLoading: Databases.selectors.getLoading,
    getError: Databases.selectors.getError,
    requestType: "idFields",
  });
};

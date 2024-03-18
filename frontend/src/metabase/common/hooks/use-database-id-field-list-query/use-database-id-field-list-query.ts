import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import Databases from "metabase/entities/databases";
import type Field from "metabase-lib/v1/metadata/Field";
import type { DatabaseId, DatabaseIdFieldListQuery } from "metabase-types/api";

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

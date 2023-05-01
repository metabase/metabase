import Tables from "metabase/entities/tables";
import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { TableQuery } from "metabase-types/api";
import Table from "metabase-lib/metadata/Table";

export const useTableQuery = (
  props: UseEntityQueryProps<TableQuery> = {},
): UseEntityQueryResult<Table> => {
  return useEntityQuery(props, {
    fetch: Tables.actions.fetch,
    getObject: Tables.selectors.getObject,
    getLoading: Tables.selectors.getLoading,
    getError: Tables.selectors.getError,
  });
};

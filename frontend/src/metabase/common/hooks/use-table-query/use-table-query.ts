import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import Tables from "metabase/entities/tables";
import type Table from "metabase-lib/metadata/Table";
import type { TableId, TableQuery } from "metabase-types/api";

export const useTableQuery = (
  props: UseEntityQueryProps<TableId, TableQuery>,
): UseEntityQueryResult<Table> => {
  return useEntityQuery(props, {
    fetch: Tables.actions.fetch,
    getObject: Tables.selectors.getObject,
    getLoading: Tables.selectors.getLoading,
    getError: Tables.selectors.getError,
  });
};

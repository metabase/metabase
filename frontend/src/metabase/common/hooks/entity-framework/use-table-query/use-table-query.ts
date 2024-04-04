import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/entity-framework/use-entity-query";
import Tables from "metabase/entities/tables";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableId, GetTableRequest } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useTableQuery = (
  props: UseEntityQueryProps<TableId, GetTableRequest>,
): UseEntityQueryResult<Table> => {
  return useEntityQuery(props, {
    fetch: Tables.actions.fetch,
    getObject: Tables.selectors.getObject,
    getLoading: Tables.selectors.getLoading,
    getError: Tables.selectors.getError,
  });
};

import Tables from "metabase/entities/tables";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import type { TableId, TableMetadataQuery } from "metabase-types/api";
import type Table from "metabase-lib/metadata/Table";

export const useTableMetadataQuery = (
  props: UseEntityQueryProps<TableId, TableMetadataQuery>,
): UseEntityQueryResult<Table> => {
  return useEntityQuery(props, {
    fetch: Tables.actions.fetchMetadata,
    getObject: Tables.selectors.getObject,
    getLoading: Tables.selectors.getLoading,
    getError: Tables.selectors.getError,
    requestType: "fetchMetadata",
  });
};

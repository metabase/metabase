import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import Tables from "metabase/entities/tables";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableId, TableMetadataQuery } from "metabase-types/api";

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

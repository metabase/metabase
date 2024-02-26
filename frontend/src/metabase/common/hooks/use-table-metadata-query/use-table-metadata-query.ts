import {
  useEntityQuery,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import Tables from "metabase/entities/tables";
import Table from "metabase-lib/metadata/Table";
import { TableId, TableMetadataQuery } from "metabase-types/api";

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

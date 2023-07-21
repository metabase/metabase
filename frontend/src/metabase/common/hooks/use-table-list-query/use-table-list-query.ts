import Tables from "metabase/entities/tables";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { TableListQuery } from "metabase-types/api";
import Table from "metabase-lib/metadata/Table";

export const useTableListQuery = (
  props: UseEntityListQueryProps<TableListQuery> = {},
): UseEntityListQueryResult<Table> => {
  return useEntityListQuery(props, {
    fetchList: Tables.actions.fetchList,
    getList: Tables.selectors.getList,
    getLoading: Tables.selectors.getLoading,
    getLoaded: Tables.selectors.getLoaded,
    getError: Tables.selectors.getError,
    getListMetadata: Tables.selectors.getListMetadata,
  });
};
